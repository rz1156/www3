const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const container = document.getElementById("cameraContainer");
const ctx = canvas.getContext("2d");

// --- STABILITY SYSTEM VARIABLES ---
let peaceDetectedFrames = 0;
let peaceLostFrames = 0;
let isCinematicMode = false;
const DEBOUNCE_THRESHOLD = 3; // Minimal 3 frame untuk aktivasi/deaktivasi

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
}
startCamera();

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
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

// --- GESTURE RECOGNITION LOGIC ---
function isPeaceSign(landmarks) {
    // MediaPipe Hand Landmarks: 
    // 8: Ujung telunjuk, 6: Sendi bawah telunjuk
    // 12: Ujung tengah, 10: Sendi bawah tengah
    // 16: Ujung manis, 14: Sendi bawah manis
    // 20: Ujung kelingking, 18: Sendi bawah kelingking
    
    // Y-axis di MediaPipe: 0 di atas, 1 di bawah. Semakin kecil angkanya, semakin tinggi posisinya.
    const isIndexUp = landmarks[8].y < landmarks[6].y;
    const isMiddleUp = landmarks[12].y < landmarks[10].y;
    const isRingDown = landmarks[16].y > landmarks[14].y;
    const isPinkyDown = landmarks[20].y > landmarks[18].y;

    return isIndexUp && isMiddleUp && isRingDown && isPinkyDown;
}

function onResults(results) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentFrameHasPeace = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            
            // Gambar tracking point tangan
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#ffffff", lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: "#00ffff", fillColor: "#ffffff", radius: 5 });

            // Cek apakah gesture ✌️ terdeteksi
            if (isPeaceSign(landmarks)) {
                currentFrameHasPeace = true;
            }
        }
    }

    // --- DEBOUNCE / SMOOTHING SYSTEM ---
    if (currentFrameHasPeace) {
        peaceDetectedFrames++;
        peaceLostFrames = 0; // Reset counter hilang

        if (peaceDetectedFrames >= DEBOUNCE_THRESHOLD && !isCinematicMode) {
            isCinematicMode = true;
            container.classList.add("cinematic-active");
        }
    } else {
        peaceLostFrames++;
        peaceDetectedFrames = 0; // Reset counter deteksi

        if (peaceLostFrames >= DEBOUNCE_THRESHOLD && isCinematicMode) {
            isCinematicMode = false;
            container.classList.remove("cinematic-active");
        }
    }
}
