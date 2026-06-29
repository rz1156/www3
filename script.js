const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

// FIX: Menggunakan querySelector agar langsung mendeteksi class jika ID lupa dipasang
const container = document.querySelector(".camera-container");
const ctx = canvas.getContext("2d");

let peaceDetectedFrames = 0;
let peaceLostFrames = 0;
let isCinematicMode = false;
const DEBOUNCE_THRESHOLD = 3; 

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 } 
    });
    video.srcObject = stream;
}
startCamera();

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6, // Sedikit diturunkan agar lebih responsif
    minTrackingConfidence: 0.6
});

hands.onResults(onResults);

const camera = new Camera(video, {
    onFrame: async () => {
        await hands.send({ image: video });
    },
    width: 1280,
    height: 720
});
camera.start();

// Fungsi pembantu untuk menghitung jarak antara 2 titik (Matematika Pythagoras)
function getDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// LOGIKA DETEKSI GESTURE BERBASIS JARAK (ANTI-GAGAL)
function isPeaceSign(landmarks) {
    const wrist = landmarks[0];
    
    // Hitung jarak dari pergelangan tangan ke ujung-ujung jari
    const indexDist = getDistance(landmarks[8], wrist);  // Telunjuk
    const middleDist = getDistance(landmarks[12], wrist); // Jari Tengah
    const ringDist = getDistance(landmarks[16], wrist);   // Jari Manis
    const pinkyDist = getDistance(landmarks[20], wrist);  // Kelingking

    // Hitung jarak ke sendi dasar jari (MCP Joint) sebagai patokan jari terlipat
    const indexBaseDist = getDistance(landmarks[5], wrist);
    const middleBaseDist = getDistance(landmarks[9], wrist);
    const ringBaseDist = getDistance(landmarks[13], wrist);
    const pinkyBaseDist = getDistance(landmarks[17], wrist);

    // Jari dinyatakan "TEGAK" jika ujungnya lebih jauh dari pergelangan dibanding sendi dasarnya
    const isIndexUp = indexDist > indexBaseDist * 1.2;
    const isMiddleUp = middleDist > middleBaseDist * 1.2;
    
    // Jari dinyatakan "TERLIPAT" jika ujungnya mendekati/lebih pendek dari sendi dasarnya
    const isRingDown = ringDist < ringBaseDist * 1.1;
    const isPinkyDown = pinkyDist < pinkyBaseDist * 1.1;

    // Syarat Peace Sign: Telunjuk & Tengah UP, Manis & Kelingking DOWN
    return isIndexUp && isMiddleUp && isRingDown && isPinkyDown;
}

function onResults(results) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentFrameHasPeace = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            
            // Menggambar skeleton tracking
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#ffffff", lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: "#00ffff", fillColor: "#ffffff", radius: 4 });

            if (isPeaceSign(landmarks)) {
                currentFrameHasPeace = true;
            }
        }
    }

    // --- STABILITY SYSTEM (DEBOUNCE) ---
    if (currentFrameHasPeace) {
        peaceDetectedFrames++;
        peaceLostFrames = 0;

        if (peaceDetectedFrames >= DEBOUNCE_THRESHOLD && !isCinematicMode) {
            isCinematicMode = true;
            if (container) container.classList.add("cinematic-active");
        }
    } else {
        peaceLostFrames++;
        peaceDetectedFrames = 0;

        if (peaceLostFrames >= DEBOUNCE_THRESHOLD && isCinematicMode) {
            isCinematicMode = false;
            if (container) container.classList.remove("cinematic-active");
        }
    }
}
