// Acessando os elementos HTML
const startScreen = document.getElementById('startScreen');
const playerNameInput = document.getElementById('playerNameInput');
const startButton = document.getElementById('startButton');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Conexão com o servidor Socket.IO
// LEMBRE-SE DE SUBSTITUIR ESTE URL PELO SEU URL DO RENDER/RAILWAY!
const SERVER_URL = 'COLE_O_URL_DO_RENDER_AQUI'; // EX: 'https://flappy-bird-server.onrender.com'
const socket = io(SERVER_URL);

// --- Configurações do Jogo (Cliente - apenas para desenho) ---
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
let myName = 'Jogador'; // Nome padrão, será atualizado pelo input

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


// --- Lógica da Tela Inicial ---
startButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        myName = name;
        startScreen.style.display = 'none'; // Esconde a tela inicial
        canvas.style.display = 'block'; // Mostra o canvas do jogo
        // Agora que o nome foi inserido, enviamos o evento 'joinGame'
        const roomId = 'salaDoFlappy';
        socket.emit('joinGame', { roomId: roomId, playerName: myName });
    } else {
        alert('Por favor, digite seu nome para iniciar o jogo!');
        playerNameInput.focus();
    }
});

// Permite iniciar o jogo pressionando Enter no campo de nome
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startButton.click();
    }
});


// --- Eventos do Socket.IO ---

socket.on('connect', () => {
    console.log('Conectado ao servidor! Meu ID:', socket.id);
    myId = socket.id;
    // Não enviamos mais o 'joinGame' imediatamente, só depois do botão iniciar
});

socket.on('roomFull', () => {
    alert('A sala de jogo está cheia (máximo de 4 jogadores). Tente novamente mais tarde.');
    startScreen.style.display = 'flex'; // Mostra a tela inicial novamente
    canvas.style.display = 'none'; // Esconde o canvas
    console.log('Sala cheia, não foi possível entrar.');
});

// Este é o evento mais importante agora: o servidor envia o estado completo do jogo
socket.on('gameState', (gameState) => {
    currentGameState = gameState; // Atualiza o estado local com o que veio do servidor
    drawGame(); // Redesenha o jogo com o novo estado
    updateScoreDisplay(); // Atualiza a exibição da pontuação
    updatePlayerListDisplay(); // Atualiza a lista de jogadores
});

socket.on('playerDied', (playerId) => {
    console.log(`Jogador ${currentGameState.players[playerId]?.name || playerId} morreu!`);
    // Poderíamos tocar um som, mostrar uma animação, etc.
});

socket.on('updateScore', (data) => {
    // A pontuação já é atualizada pelo 'gameState', mas este evento pode ser útil para feedbacks instantâneos
});

socket.on('playerJoined', (playerData) => {
    console.log('Novo jogador entrou:', playerData.name || playerData.id);
    // O gameState já trará o novo jogador, mas este evento pode ser útil para notificações
});

socket.on('playerLeft', (playerId) => {
    console.log('Jogador saiu:', playerId);
    // O gameState vai parar de enviar os dados dele, mas pode ser útil para notificações
});

socket.on('gameOver', () => {
    alert('Fim de jogo! Todos os pássaros morreram.');
    // Volta para a tela inicial
    startScreen.style.display = 'flex';
    canvas.style.display = 'none';
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

        // Desenhar o nome do jogador acima do pássaro
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(bird.name || 'Jogador', bird.x + BIRD_SIZE / 2, bird.y - 5);
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
        playerListHtml += `<span style="color:${player.color};">${player.name || id.substring(0, 5)}...${isMe}</span> - ${status} - Pontos: ${player.score}<br>`;
    }
    playerListDisplay.innerHTML = playerListHtml;
}


// --- Evento de Clique para Fazer o Pássaro Pular ---
document.addEventListener('click', () => {
    // Apenas envia o comando de pulo para o servidor se o jogo estiver visível
    if (canvas.style.display === 'block') {
        socket.emit('jump');
    }
});

// Inicialmente esconde o canvas e mostra a tela inicial
canvas.style.display = 'none';
startScreen.style.display = 'flex';
playerNameInput.focus(); // Coloca o foco no campo de nome