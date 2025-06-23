const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos (HTML, CSS, JS do cliente)
app.use(express.static('public'));

// --- Configurações do Jogo (Servidor) ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 480;
const GROUND_HEIGHT = 50;
const GRAVITY = 0.5;
const JUMP_STRENGTH = -9;
const BIRD_SIZE = 30;

const PIPE_WIDTH = 50;
const PIPE_GAP = 150; // Espaço entre os canos superior e inferior
const PIPE_SPEED = 3; // Velocidade de movimento dos canos
const PIPE_SPAWN_INTERVAL = 2000; // Tempo em ms para gerar um novo par de canos

// --- Estado do Jogo Global (no Servidor) ---
const gameRooms = {}; // { 'roomId': { players: { 'socketId': { x, y, velocity, score, color, alive, name }, ... }, pipes: [], gameRunning: boolean, lastPipeSpawn: timestamp, gameInterval: null } }

io.on('connection', (socket) => {
    console.log(`Um novo jogador se conectou: ${socket.id}`);

    // Alteração A: Agora 'joinGame' espera um objeto 'data' com roomId e playerName
    socket.on('joinGame', (data) => {
        const roomId = data.roomId;
        const playerName = data.playerName || `Jogador ${socket.id.substring(0, 4)}`; // Pega o nome ou um padrão se não for fornecido

        // Limita a 4 jogadores por sala
        if (!gameRooms[roomId]) {
            gameRooms[roomId] = {
                players: {},
                pipes: [],
                gameRunning: false,
                lastPipeSpawn: Date.now(),
                gameInterval: null // Para guardar o setInterval do loop do jogo
            };
        }

        const currentPlayersInRoom = Object.keys(gameRooms[roomId].players).length;
        if (currentPlayersInRoom >= 4) {
            socket.emit('roomFull');
            console.log(`Sala ${roomId} cheia. ${socket.id} não pôde entrar.`);
            return;
        }

        socket.join(roomId);
        console.log(`Jogador ${socket.id} entrou na sala: ${roomId}`);

        // Inicializa o estado do pássaro para este novo jogador
        // Alteração B: Adicionado 'name: playerName'
        gameRooms[roomId].players[socket.id] = {
            x: 50 + (currentPlayersInRoom * 50), // Posiciona os pássaros lado a lado no início
            y: GAME_HEIGHT / 2,
            velocity: 0,
            score: 0,
            color: getRandomColor(),
            alive: true, // Indica se o pássaro está vivo
            name: playerName // <<< ADICIONADO: Nome do jogador
        };

        // Avisa a todos na sala sobre o novo jogador e o estado atualizado
        // Alteração C: Adicionado 'name' ao playerJoined emit
        io.to(roomId).emit('playerJoined', {
            id: socket.id,
            x: gameRooms[roomId].players[socket.id].x,
            y: gameRooms[roomId].players[socket.id].y,
            color: gameRooms[roomId].players[socket.id].color,
            name: gameRooms[roomId].players[socket.id].name // <<< ADICIONADO: Nome do jogador
        });

        // Envia o estado completo de todos os jogadores e canos na sala para o novo jogador
        socket.emit('gameState', {
            players: gameRooms[roomId].players,
            pipes: gameRooms[roomId].pipes
        });

        // Se este for o primeiro jogador, inicia o loop do jogo no servidor
        if (Object.keys(gameRooms[roomId].players).length === 1 && !gameRooms[roomId].gameRunning) {
            startGameLoop(roomId);
        }

        io.to(roomId).emit('updatePlayersList', Object.keys(gameRooms[roomId].players).length);
    });

    socket.on('jump', () => {
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (rooms.length > 0) {
            const roomId = rooms[0];
            const player = gameRooms[roomId].players[socket.id];
            if (player && player.alive) { // Apenas pássaros vivos podem pular
                player.velocity = JUMP_STRENGTH;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectou: ${socket.id}`);
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].players[socket.id]) {
                delete gameRooms[roomId].players[socket.id];
                io.to(roomId).emit('playerLeft', socket.id);
                io.to(roomId).emit('updatePlayersList', Object.keys(gameRooms[roomId].players).length);

                // Se não houver mais jogadores na sala, para o loop do jogo
                if (Object.keys(gameRooms[roomId].players).length === 0) {
                    clearInterval(gameRooms[roomId].gameInterval);
                    delete gameRooms[roomId]; // Remove a sala se estiver vazia
                    console.log(`Sala ${roomId} encerrada por falta de jogadores.`);
                }
                break;
            }
        }
    });
});

// --- Lógica do Jogo no Servidor ---

function startGameLoop(roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    room.gameRunning = true;
    console.log(`Loop de jogo iniciado para sala: ${roomId}`);

    room.gameInterval = setInterval(() => {
        updateGameServer(roomId);
        // Envia o estado completo do jogo a cada quadro
        io.to(roomId).emit('gameState', {
            players: room.players,
            pipes: room.pipes
        });

    }, 1000 / 60); // 60 quadros por segundo
}

function updateGameServer(roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    let allPlayersDead = true;

    // Atualizar pássaros
    for (const playerId in room.players) {
        const player = room.players[playerId];
        if (player.alive) {
            allPlayersDead = false; // Há pelo menos um jogador vivo

            player.velocity += GRAVITY;
            player.y += player.velocity;

            // Colisão com o chão
            if (player.y + BIRD_SIZE > GAME_HEIGHT - GROUND_HEIGHT) {
                player.y = GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
                player.velocity = 0;
                player.alive = false; // Morreu
                io.to(roomId).emit('playerDied', playerId);
            }
            // Colisão com o teto
            if (player.y < 0) {
                player.y = 0;
                player.velocity = 0;
            }

            // Colisão com os canos
            room.pipes.forEach(pipe => {
                if (player.alive && // Só verifica colisão se o pássaro estiver vivo
                    player.x < pipe.x + PIPE_WIDTH &&
                    player.x + BIRD_SIZE > pipe.x &&
                    (player.y < pipe.y_top_end || player.y + BIRD_SIZE > pipe.y_bottom_start)) {
                    
                    player.alive = false; // Morreu
                    io.to(roomId).emit('playerDied', playerId);
                }

                // Pontuação (se o pássaro passou pelo cano e ainda está vivo)
                if (player.alive && !pipe.scored && player.x > pipe.x + PIPE_WIDTH) {
                    player.score++;
                    pipe.scored = true; // Marca o cano como pontuado para não contar de novo
                    io.to(roomId).emit('updateScore', { id: playerId, score: player.score });
                }
            });
        }
    }

    // Se todos os jogadores morreram, parar o jogo
    if (allPlayersDead && Object.keys(room.players).length > 0) {
        clearInterval(room.gameInterval);
        room.gameRunning = false;
        console.log(`Todos os jogadores na sala ${roomId} morreram. Jogo parado.`);
        io.to(roomId).emit('gameOver');
        // Você pode adicionar uma lógica para reiniciar o jogo aqui
    }

    // Gerar e mover canos
    if (room.gameRunning) { // Só gera e move canos se o jogo estiver rodando
        if (Date.now() - room.lastPipeSpawn > PIPE_SPAWN_INTERVAL) {
            generatePipe(roomId);
            room.lastPipeSpawn = Date.now();
        }

        room.pipes.forEach(pipe => {
            pipe.x -= PIPE_SPEED;
        });

        // Remover canos que saíram da tela
        room.pipes = room.pipes.filter(pipe => pipe.x + PIPE_WIDTH > 0);
    }
}

function generatePipe(roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    const minGapY = 50; // Mínima altura do topo do cano de cima
    const maxGapY = GAME_HEIGHT - GROUND_HEIGHT - PIPE_GAP - 50; // Máxima altura do topo do cano de cima
    const gapY = Math.random() * (maxGapY - minGapY) + minGapY; // Posição Y do topo do cano superior

    room.pipes.push({
        x: GAME_WIDTH,
        y_top_end: gapY,
        y_bottom_start: gapY + PIPE_GAP,
        scored: false // Para controlar se este cano já deu ponto
    });
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Para jogar, abra seu navegador e acesse http://localhost:${PORT}`);
    console.log(`Para testar multiplayer, abra várias abas do navegador.`);
});