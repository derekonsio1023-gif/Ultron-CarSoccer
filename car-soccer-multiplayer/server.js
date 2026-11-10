const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const CANNON = require('cannon-es');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Mundo de física del servidor
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Material del suelo y pelota
const groundMaterial = new CANNON.Material();
const ballMaterial = new CANNON.Material();
const carMaterial = new CANNON.Material();

const groundBallContact = new CANNON.ContactMaterial(groundMaterial, ballMaterial, {
    friction: 0.3,
    restitution: 0.7
});
const carBallContact = new CANNON.ContactMaterial(carMaterial, ballMaterial, {
    friction: 0.5,
    restitution: 0.8
});
world.addContactMaterial(groundBallContact);
world.addContactMaterial(carBallContact);

// Suelo
const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: groundMaterial
});
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Pelota
const ballRadius = 1;
const ballBody = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(ballRadius),
    material: ballMaterial,
    position: new CANNON.Vec3(0, ballRadius, 0)
});
world.addBody(ballBody);

// Estado del juego
const gameState = {
    players: {},
    ball: { x: 0, y: ballRadius, z: 0 },
    goals: { team1: 0, team2: 0 }
};

// Input de jugadores
const playerInputs = {};

io.on('connection', (socket) => {
    console.log('🎮 Jugador conectado:', socket.id);
    
    // Asignar equipo alternado
    const team = Object.keys(gameState.players).length % 2 === 0 ? 1 : 2;
    
    // Crear cuerpo del coche
    const carBody = new CANNON.Body({
        mass: 100,
        shape: new CANNON.Box(new CANNON.Vec3(2, 1, 3)),
        material: carMaterial,
        position: new CANNON.Vec3(team === 1 ? -20 : 20, 1, 0)
    });
    world.addBody(carBody);
    
    gameState.players[socket.id] = {
        id: socket.id,
        team: team,
        body: carBody
    };
    
    playerInputs[socket.id] = {
        throttle: 0,
        steer: 0,
        boost: false
    };
    
    // Enviar estado inicial al jugador
    socket.emit('init', {
        id: socket.id,
        team: team,
        players: Object.keys(gameState.players).map(id => ({
            id,
            team: gameState.players[id].team
        })),
        ball: gameState.ball,
        goals: gameState.goals
    });
    
    // Notificar a otros jugadores
    socket.broadcast.emit('player-joined', {
        id: socket.id,
        team: team
    });
    
    // Manejar input del jugador
    socket.on('input', (data) => {
        if (playerInputs[socket.id]) {
            playerInputs[socket.id] = { ...playerInputs[socket.id], ...data };
        }
    });
    
    // Desconexión
    socket.on('disconnect', () => {
        console.log('🔌 Jugador desconectado:', socket.id);
        if (gameState.players[socket.id]) {
            world.removeBody(gameState.players[socket.id].body);
        }
        delete gameState.players[socket.id];
        delete playerInputs[socket.id];
        io.emit('player-left', socket.id);
    });
});

// Game loop del servidor (60 FPS)
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;

function applyCarControls(body, input) {
    // Velocidad máxima y torque
    const maxSpeed = 30;
    const turnSpeed = 2;
    const boostMultiplier = input.boost ? 2 : 1;
    
    // Aplicar fuerza hacia adelante/atrás usando el quaternion del cuerpo
    const forward = new CANNON.Vec3(0, 0, 1);
    const rotatedForward = body.quaternion.vmult(forward);
    
    const speed = input.throttle * maxSpeed * boostMultiplier;
    body.velocity.x += rotatedForward.x * speed * 0.1;
    body.velocity.z += rotatedForward.z * speed * 0.1;
    
    // Girar
    if (Math.abs(body.velocity.x) > 0.1 || Math.abs(body.velocity.z) > 0.1) {
        body.angularVelocity.y = -input.steer * turnSpeed;
    }
    
    // Fricción
    body.velocity.x *= 0.98;
    body.velocity.z *= 0.98;
    body.angularVelocity.y *= 0.95;
}

function checkGoals() {
    const ballX = ballBody.position.x;
    const FIELD_WIDTH = 50;
    
    if (ballX > FIELD_WIDTH) {
        gameState.goals.team1++;
        io.emit('goal-scored', { team: 1, goals: gameState.goals });
        resetBall();
    } else if (ballX < -FIELD_WIDTH) {
        gameState.goals.team2++;
        io.emit('goal-scored', { team: 2, goals: gameState.goals });
        resetBall();
    }
}

function resetBall() {
    ballBody.position.set(0, ballRadius, 0);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
}

function gameLoop() {
    // Aplicar controles a todos los coches
    Object.keys(gameState.players).forEach(id => {
        const player = gameState.players[id];
        const input = playerInputs[id];
        if (player.body && input) {
            applyCarControls(player.body, input);
        }
    });
    
    // Step de física
    world.step(1 / TICK_RATE);
    
    // Check goals
    checkGoals();
    
    // Sincronizar estado con clientes
    const playerStates = {};
    Object.keys(gameState.players).forEach(id => {
        const player = gameState.players[id];
        playerStates[id] = {
            id: id,
            team: player.team,
            x: player.body.position.x,
            y: player.body.position.y,
            z: player.body.position.z,
            rotation: player.body.quaternion
        };
    });
    
    gameState.ball = {
        x: ballBody.position.x,
        y: ballBody.position.y,
        z: ballBody.position.z
    };
    
    io.emit('game-state', {
        players: playerStates,
        ball: gameState.ball,
        goals: gameState.goals
    });
}

setInterval(gameLoop, TICK_INTERVAL);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
