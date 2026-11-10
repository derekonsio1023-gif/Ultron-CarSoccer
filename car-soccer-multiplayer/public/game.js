// Conexión Socket.io
const socket = io();

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12376f);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Campo de fútbol
const fieldWidth = 100;
const fieldLength = 150;
const fieldGeometry = new THREE.PlaneGeometry(fieldWidth, fieldLength);
const fieldMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d5a27,
    roughness: 0.8
});
const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);

// Líneas del campo
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
const fieldLines = [
    // Línea central
    new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0.1, -fieldLength/2),
            new THREE.Vector3(0, 0.1, fieldLength/2)
        ]),
        lineMaterial
    ),
    // Círculo central
    new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 64 }, (_, i) => {
                const angle = (i / 64) * Math.PI * 2;
                return new THREE.Vector3(Math.cos(angle) * 10, 0.1, Math.sin(angle) * 10);
            })
        ),
        lineMaterial
    )
];
fieldLines.forEach(line => scene.add(line));

// Paredes
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
const walls = [
    { pos: [0, 2, -fieldLength/2], size: [fieldWidth, 4, 1] },
    { pos: [0, 2, fieldLength/2], size: [fieldWidth, 4, 1] },
    { pos: [-fieldWidth/2, 2, 0], size: [1, 4, fieldLength] },
    { pos: [fieldWidth/2, 2, 0], size: [1, 4, fieldLength] }
];
walls.forEach(wall => {
    const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(...wall.size),
        wallMaterial
    );
    wallMesh.position.set(...wall.pos);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
});

// Pelota
const ballRadius = 1;
const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
const ball = new THREE.Mesh(ballGeometry, ballMaterial);
ball.castShadow = true;
scene.add(ball);

// Coches (mapa de ID a mesh)
const carMeshes = {};
const carGeometry = new THREE.BoxGeometry(2, 1, 3);
const carMaterials = {
    1: new THREE.MeshStandardMaterial({ color: 0x0066ff }), // Team 1 - Azul
    2: new THREE.MeshStandardMaterial({ color: 0xff0000 })  // Team 2 - Rojo
};

// Estado del juego
let myTeam = null;
let myId = null;
const playerStates = {};
const ballState = { x: 0, y: ballRadius, z: 0 };

// Input del jugador
const input = {
    throttle: 0,
    steer: 0,
    boost: false
};

// Manejo de teclado
const keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    updateInput();
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    updateInput();
});

function updateInput() {
    // W/↑: Acelerar
    if (keys['KeyW'] || keys['ArrowUp']) {
        input.throttle = 1;
    } else if (keys['KeyS'] || keys['ArrowDown']) {
        input.throttle = -1;
    } else {
        input.throttle = 0;
    }
    
    // A/←: Izquierda
    if (keys['KeyA'] || keys['ArrowLeft']) {
        input.steer = 1;
    } else if (keys['KeyD'] || keys['ArrowRight']) {
        input.steer = -1;
    } else {
        input.steer = 0;
    }
    
    // SPACE: Boost
    input.boost = keys['Space'];
    
    // Enviar input al servidor
    socket.emit('input', input);
}

// Socket.io eventos
socket.on('init', (data) => {
    myId = data.id;
    myTeam = data.team;
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('team').textContent = `Team: ${myTeam}`;
    
    // Crear meshes de coches existentes
    data.players.forEach(player => {
        createCarMesh(player.id, player.team);
    });
    
    updateScore(data.goals);
});

socket.on('player-joined', (data) => {
    createCarMesh(data.id, data.team);
});

socket.on('player-left', (id) => {
    if (carMeshes[id]) {
        scene.remove(carMeshes[id]);
        delete carMeshes[id];
    }
    delete playerStates[id];
});

socket.on('game-state', (data) => {
    // Actualizar estado de jugadores
    Object.keys(data.players).forEach(id => {
        playerStates[id] = data.players[id];
    });
    
    // Actualizar estado de pelota
    ballState.x = data.ball.x;
    ballState.y = data.ball.y;
    ballState.z = data.ball.z;
    
    // Actualizar score
    updateScore(data.goals);
});

socket.on('goal-scored', (data) => {
    updateScore(data.goals);
});

function createCarMesh(id, team) {
    const car = new THREE.Mesh(carGeometry, carMaterials[team]);
    car.castShadow = true;
    car.receiveShadow = true;
    scene.add(car);
    carMeshes[id] = car;
}

function updateScore(goals) {
    document.getElementById('score').textContent = 
        `Team 1: ${goals.team1} - Team 2: ${goals.team2}`;
}

// Interpolación suave
function lerp(start, end, t) {
    return start + (end - start) * t;
}

// Game loop del cliente
function animate() {
    requestAnimationFrame(animate);
    
    // Interpolar posición de pelota
    ball.position.x = lerp(ball.position.x, ballState.x, 0.3);
    ball.position.y = lerp(ball.position.y, ballState.y, 0.3);
    ball.position.z = lerp(ball.position.z, ballState.z, 0.3);
    
    // Interpolar posición de coches
    Object.keys(playerStates).forEach(id => {
        const state = playerStates[id];
        const mesh = carMeshes[id];
        
        if (mesh && state) {
            mesh.position.x = lerp(mesh.position.x, state.x, 0.3);
            mesh.position.y = lerp(mesh.position.y, state.y, 0.3);
            mesh.position.z = lerp(mesh.position.z, state.z, 0.3);
            
            if (state.rotation) {
                mesh.quaternion.set(
                    state.rotation.x,
                    state.rotation.y,
                    state.rotation.z,
                    state.rotation.w
                );
            }
        }
    });
    
    // Cámara sigue al jugador
    if (myId && carMeshes[myId]) {
        const myCar = carMeshes[myId];
        camera.position.x = myCar.position.x;
        camera.position.y = myCar.position.y + 20;
        camera.position.z = myCar.position.z + 30;
        camera.lookAt(myCar.position);
    }
    
    renderer.render(scene, camera);
}

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
