const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const hud = document.getElementById("hud");
const hudBrackets = document.querySelector(".hud-brackets");
const hudLabel = document.getElementById("hudLabel");
const vignette = document.getElementById("vignette");

async function startCamera(){

    const stream = await navigator.mediaDevices.getUserMedia({

        video:true

    });

    video.srcObject = stream;

}

startCamera();

const hands = new Hands({

    locateFile:(file)=>{

        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;

    }

});

hands.setOptions({

    maxNumHands:2,

    modelComplexity:1,

    minDetectionConfidence:0.7,

    minTrackingConfidence:0.7

});

hands.onResults(onResults);

const camera = new Camera(video,{

    onFrame:async()=>{

        await hands.send({

            image:video

        });

    },

    width:1280,

    height:720

});

camera.start();

function onResults(results){

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0,0,canvas.width,canvas.height);

    let vDetected = false;

    if(results.multiHandLandmarks){

        for(const landmarks of results.multiHandLandmarks){

            drawConnectors(
                ctx,
                landmarks,
                HAND_CONNECTIONS,
                {
                    color:"#ffffff",
                    lineWidth:2
                }
            );

            drawLandmarks(
                ctx,
                landmarks,
                {
                    color:"#00ffff",
                    fillColor:"#ffffff",
                    radius:5
                }
            );

            if(isVSign(landmarks)) vDetected = true;

        }

    }

    updateGestureState(vDetected);

}

/* ===================================================================
   V-SIGN (✌️) DETECTION
   A finger is considered "extended" when its tip sits meaningfully
   farther from the wrist than its PIP joint does.
=================================================================== */

function dist(a,b){
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
}

function isFingerExtended(landmarks, tipIdx, pipIdx, wristIdx = 0){
    const wrist = landmarks[wristIdx];
    return dist(wrist, landmarks[tipIdx]) > dist(wrist, landmarks[pipIdx]) * 1.15;
}

function isVSign(landmarks){
    const index  = isFingerExtended(landmarks, 8, 6);
    const middle = isFingerExtended(landmarks, 12, 10);
    const ring   = isFingerExtended(landmarks, 16, 14);
    const pinky  = isFingerExtended(landmarks, 20, 18);

    return index && middle && !ring && !pinky;
}

/* ===================================================================
   GESTURE STABILITY (debounce / hysteresis)
=================================================================== */

let vSignFrames   = 0;
let lostFrames    = 0;
let gestureActive = false;
let cinemaActive  = false;
let holdStartTime = null;
let cinemaCheckTimer = null;

const STABILITY_FRAMES = 5;
const CINEMA_HOLD_MS   = 2000;

function updateGestureState(detected){

    if(detected){

        vSignFrames++;
        lostFrames = 0;

        if(!gestureActive && vSignFrames >= STABILITY_FRAMES){

            gestureActive = true;
            holdStartTime = performance.now();

            onFocusStart();

            cinemaCheckTimer = setInterval(()=>{
                if(gestureActive && !cinemaActive &&
                   performance.now() - holdStartTime >= CINEMA_HOLD_MS){
                    onCinemaStart();
                }
            }, 100);

        }

    } else {

        lostFrames++;
        vSignFrames = 0;

        if(gestureActive && lostFrames >= STABILITY_FRAMES){

            gestureActive = false;
            clearInterval(cinemaCheckTimer);
            onFocusEnd();

        }

    }

}

/* ===================================================================
   CINEMATIC FOCUS STATE MACHINE
   normal -> hunting -> focus lock (DOF ramp) -> breathing
   -> (optional) cinema mode
   -> release (smooth back to normal)
=================================================================== */

function onFocusStart(){

    video.classList.remove("focused","cinema","breathing");
    video.classList.add("hunting");

    hud.classList.add("show");
    hudBrackets.classList.add("hunting");

    vignette.classList.add("active");

    startParticles();

    const onHuntDone = (e)=>{
        if(e.animationName !== "focusHunt") return;
        video.removeEventListener("animationend", onHuntDone);

        video.classList.remove("hunting");
        hudBrackets.classList.remove("hunting");
        hudBrackets.classList.add("locked");

        // focus lock + depth of field ramp
        video.classList.add("focused");

        const onLockDone = (e2)=>{
            if(e2.propertyName !== "filter") return;
            video.removeEventListener("transitionend", onLockDone);

            if(gestureActive){
                video.classList.add("breathing");
                hudLabel.classList.add("show");
            }
        };

        video.addEventListener("transitionend", onLockDone);
    };

    video.addEventListener("animationend", onHuntDone);

}

function onCinemaStart(){

    cinemaActive = true;

    video.classList.remove("breathing");
    video.classList.add("cinema");

    vignette.classList.add("cinema-active");
    hud.classList.add("cinema");
    hudLabel.textContent = "CINEMA MODE ACTIVE";

    boostParticlesForCinema();

    const onCinemaLockDone = (e)=>{
        if(e.propertyName !== "filter") return;
        video.removeEventListener("transitionend", onCinemaLockDone);

        if(gestureActive && cinemaActive){
            video.classList.add("breathing");
        }
    };

    video.addEventListener("transitionend", onCinemaLockDone);

}

function onFocusEnd(){

    cinemaActive = false;

    video.classList.remove("hunting","focused","cinema","breathing");

    hud.classList.remove("show","cinema");
    hudBrackets.classList.remove("hunting","locked");
    hudLabel.classList.remove("show");
    hudLabel.textContent = "FOCUS MODE";

    vignette.classList.remove("active","cinema-active");

    stopParticlesGracefully();

}

/* ===================================================================
   FLOATING LIGHT-DUST PARTICLES
=================================================================== */

const particlesCanvas = document.getElementById("particles");
const pctx = particlesCanvas.getContext("2d");

let particles = [];
let particleAnimId = null;
let particlesFadingOut = false;

function resizeParticlesCanvas(){
    const rect = document.querySelector(".camera-container").getBoundingClientRect();
    particlesCanvas.width = rect.width;
    particlesCanvas.height = rect.height;
}

window.addEventListener("resize", resizeParticlesCanvas);
resizeParticlesCanvas();

function makeParticle(){
    return {
        x: Math.random() * particlesCanvas.width,
        y: particlesCanvas.height + Math.random() * 40,
        r: 1 + Math.random() * 2.2,
        speed: 0.15 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
        alpha: 0,
        targetAlpha: 0.25 + Math.random() * 0.35
    };
}

function spawnParticles(count){
    for(let i = 0; i < count; i++){
        particles.push(makeParticle());
    }
}

function boostParticlesForCinema(){
    spawnParticles(6);
    for(const p of particles){
        p.targetAlpha = Math.min(0.7, p.targetAlpha + 0.1);
    }
}

function updateParticles(){

    pctx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);

    for(const p of particles){

        if(particlesFadingOut){
            p.alpha -= 0.012;
        } else if(p.alpha < p.targetAlpha){
            p.alpha += 0.012;
        }

        p.y -= p.speed;
        p.x += Math.sin(p.phase + p.y * 0.01) * 0.15;

        if(p.y < -10){
            p.y = particlesCanvas.height + 10;
            p.x = Math.random() * particlesCanvas.width;
        }

        if(p.alpha > 0){
            const glow = pctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
            glow.addColorStop(0, `rgba(190,255,250,${p.alpha})`);
            glow.addColorStop(1, "rgba(190,255,250,0)");
            pctx.fillStyle = glow;
            pctx.beginPath();
            pctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
            pctx.fill();
        }

    }

    if(particlesFadingOut && particles.every(p => p.alpha <= 0)){
        particles = [];
        particlesFadingOut = false;
        cancelAnimationFrame(particleAnimId);
        particleAnimId = null;
        return;
    }

    particleAnimId = requestAnimationFrame(updateParticles);

}

function startParticles(){
    particlesFadingOut = false;
    if(particles.length === 0){
        spawnParticles(16);
    }
    if(!particleAnimId){
        particleAnimId = requestAnimationFrame(updateParticles);
    }
}

function stopParticlesGracefully(){
    particlesFadingOut = true;
    if(!particleAnimId){
        particleAnimId = requestAnimationFrame(updateParticles);
    }
}
