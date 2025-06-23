// Acessando o elemento canvas no HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Conexão com o servidor Socket.IO
const socket = io();

// --- Configurações do Jogo (Cliente - apenas para desenho) ---
// Estas constantes devem ser as mesmas do servidor para o desenho ficar correto
const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const GROUND_HEIGHT = 50;
const BIRD_SIZE = 30;
const PIPE_WIDTH = 50;
const PIPE_GAP = 150;

// Objeto para armazenar o estado do jogo recebido do servidor
let currentGameState = {
    players: {},
    pipes: []
};

let myId = null; // Para guardar o ID do meu próprio jogador

// --- Elementos HTML para a pontuação e jogadores ---
const scoreDisplay = document.createElement('div');
scoreDisplay.style.position = 'absolute';
scoreDisplay.style.top = '10px';
scoreDisplay.style.right = '10px';
scoreDisplay.style.color = '#fff';
scoreDisplay.style.fontSize = '20px';
scoreDisplay.style.fontWeight = 'bold';
scoreDisplay.style.textAlign = 'right';
document.body.appendChild(scoreDisplay);

const playerListDisplay = document.createElement('div');
playerListDisplay.style.position = 'absolute';
playerListDisplay.style.top = '10px';
playerListDisplay.style.left = '10px';
playerListDisplay.style.color = '#fff';
playerListDisplay.style.fontSize = '18px';
playerListDisplay.style.fontWeight = 'bold';
playerListDisplay.style.backgroundColor = 'rgba(0,0,0,0.5)';
playerListDisplay.style.padding = '10px';
playerListDisplay.style.borderRadius = '5px';
document.body.appendChild(playerListDisplay);


// --- Eventos do Socket.IO ---

socket.on('connect', () => {
    console.log('Conectado ao servidor! Meu ID:', socket.id);
    myId = socket.id;

    const roomId = 'salaDoFlappy'; // Você pode fazer uma interface para o usuário escolher depois.
    socket.emit('joinGame', roomId); // Pede para entrar na sala
});

socket.on('roomFull', () => {
    alert('A sala de jogo está cheia (máximo de 4 jogadores). Tente novamente mais tarde.');
    console.log('Sala cheia, não foi possível entrar.');
    // Poderia redirecionar ou desabilitar o jogo aqui
});

// Este é o evento mais importante agora: o servidor envia o estado completo do jogo
socket.on('gameState', (gameState) => {
    currentGameState = gameState; // Atualiza o estado local com o que veio do servidor
    drawGame(); // Redesenha o jogo com o novo estado
    updateScoreDisplay(); // Atualiza a exibição da pontuação
});

socket.on('playerDied', (playerId) => {
    console.log(`Jogador ${playerId} morreu!`);
    // Poderíamos tocar um som, mostrar uma animação, etc.
});

socket.on('updateScore', (data) => {
    console.log(`Jogador ${data.id} fez ${data.score} pontos!`);
    // A pontuação já é atualizada pelo 'gameState', mas este evento pode ser útil para feedbacks instantâneos
});

socket.on('playerJoined', (playerData) => {
    console.log('Novo jogador entrou:', playerData.id);
    // O gameState já trará o novo jogador, mas este evento pode ser útil para notificações
});

socket.on('playerLeft', (playerId) => {
    console.log('Jogador saiu:', playerId);
    // O gameState vai parar de enviar os dados dele, mas pode ser útil para notificações
});

socket.on('updatePlayersList', (playerCount) => {
    console.log(`Total de jogadores na sala: ${playerCount}`);
    updatePlayerListDisplay();
});

socket.on('gameOver', () => {
    alert('Fim de jogo! Todos os pássaros morreram.');
    // Você pode adicionar um botão para reiniciar ou ir para o lobby
});


// --- Função para Desenhar o Jogo ---
function drawGame() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT); // Limpar o canvas

    // Desenhar o chão
    ctx.fillStyle = '#A0522D';
    ctx.fillRect(0, GAME_HEIGHT - GROUND_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);

    // Desenhar os canos
    ctx.fillStyle = '#7AC74F'; // Cor verde para os canos
    currentGameState.pipes.forEach(pipe => {
        // Cano superior
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.y_top_end);
        // Cano inferior
        ctx.fillRect(pipe.x, pipe.y_bottom_start, PIPE_WIDTH, GAME_HEIGHT - GROUND_HEIGHT - pipe.y_bottom_start);
    });

    // Desenhar todos os pássaros
    for (let id in currentGameState.players) {
        const bird = currentGameState.players[id];
        ctx.fillStyle = bird.color; // Usa a cor do pássaro
        ctx.fillRect(bird.x, bird.y, BIRD_SIZE, BIRD_SIZE);

        // Desenhar um X se o pássaro estiver morto
        if (!bird.alive) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(bird.x, bird.y);
            ctx.lineTo(bird.x + BIRD_SIZE, bird.y + BIRD_SIZE);
            ctx.moveTo(bird.x + BIRD_SIZE, bird.y);
            ctx.lineTo(bird.x, bird.y + BIRD_SIZE);
            ctx.stroke();
        }
    }
}

// --- Funções de Atualização de UI ---
function updateScoreDisplay() {
    let scoreText = 'Sua Pontuação: ';
    if (myId && currentGameState.players[myId]) {
        scoreText += currentGameState.players[myId].score;
        if (!currentGameState.players[myId].alive) {
            scoreText += ' (Morto)';
        }
    } else {
        scoreText += 'N/A';
    }
    scoreDisplay.textContent = scoreText;
}

function updatePlayerListDisplay() {
    let playerListHtml = 'Jogadores Online:<br>';
    for (let id in currentGameState.players) {
        const player = currentGameState.players[id];
        const status = player.alive ? 'Vivo' : 'Morto';
        const isMe = (id === myId) ? ' (Você)' : '';
        playerListHtml += `<span style="color:${player.color};">${id.substring(0, 5)}...${isMe}</span> - ${status} - Pontos: ${player.score}<br>`;
    }
    playerListDisplay.innerHTML = playerListHtml;
}


// --- Evento de Clique para Fazer o Pássaro Pular ---
document.addEventListener('click', () => {
    // Apenas envia o comando de pulo para o servidor, o servidor decide se ele pode pular
    socket.emit('jump');
});

// Não precisamos mais do gameLoop no cliente, pois o servidor envia o estado a cada quadro.
// drawGame() será chamada sempre que um gameState for recebido.