const API_BASE_URL = 'https://face-login-app-uxmt.onrender.com/api';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const statusMessage = document.getElementById('status-message');
const cameraStatus = document.getElementById('camera-status');

let modelsLoaded = false;

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function showMessage(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `message ${type}`;
    statusMessage.style.display = '';
}

function hideMessage() {
    statusMessage.style.display = 'none';
    statusMessage.textContent = '';
}

function setButtonsEnabled(enabled) {
    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    if (enabled) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Login with Face';
        btnSignup.disabled = false;
        btnSignup.textContent = 'Sign Up with Face';
    } else {
        btnLogin.disabled = true;
        btnLogin.textContent = 'Loading...';
        btnSignup.disabled = true;
        btnSignup.textContent = 'Loading...';
    }
}

function switchTab(tab) {
    document.getElementById('login-form').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('signup-form').style.display = tab === 'signup' ? 'flex' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
    hideMessage();
}

function logout() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    hideMessage();
    startCamera();
}

// ─── Load AI Models + Camera ──────────────────────────────────────────────────

async function loadModels() {
    try {
        cameraStatus.textContent = 'Loading AI models... Please wait ⏳';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
        cameraStatus.textContent = 'Models loaded! Starting camera...';
        await startCamera();
    } catch (err) {
        cameraStatus.textContent = 'Failed to load AI models. Please refresh.';
        console.error('Model loading error:', err);
    }
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            cameraStatus.textContent = '✅ Camera ready! Face the camera clearly.';
            setButtonsEnabled(true);
            startFaceDetectionLoop();
        };
    } catch (err) {
        cameraStatus.textContent = '❌ Camera access denied. Please allow camera access.';
        console.error('Camera error:', err);
    }
}

// ─── Live Face Detection Box ──────────────────────────────────────────────────

function startFaceDetectionLoop() {
    const ctx = overlay.getContext('2d');
    setInterval(async () => {
        if (!modelsLoaded || video.paused || video.ended) return;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
        if (detection) {
            const { x, y, width, height } = detection.box;
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
        }
    }, 300);
}

// ─── Get Face Descriptor from Video ──────────────────────────────────────────

async function getFaceDescriptor() {
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

    if (!detection) {
        return null;
    }
    return Array.from(detection.descriptor); // Convert Float32Array → plain JS array
}

// ─── Signup Handler ───────────────────────────────────────────────────────────

async function handleSignup() {
    const username = document.getElementById('signup-username').value.trim();
    const firstName = document.getElementById('signup-first-name').value.trim();
    const lastName = document.getElementById('signup-last-name').value.trim();

    if (!username || !firstName || !lastName) {
        showMessage('Please fill in all fields.', 'error');
        return;
    }

    const btn = document.getElementById('btn-signup');
    btn.disabled = true;
    btn.textContent = 'Scanning face...';
    hideMessage();

    try {
        const descriptor = await getFaceDescriptor();
        if (!descriptor) {
            showMessage('No face detected! Please look directly at the camera in good lighting.', 'error');
            btn.disabled = false;
            btn.textContent = 'Sign Up with Face';
            return;
        }

        btn.textContent = 'Saving...';

        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                first_name: firstName,
                last_name: lastName,
                face_descriptor: descriptor,
            }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage(`✅ Account created! You can now login as "${username}".`, 'success');
        } else {
            showMessage(`❌ ${data.detail || data.message || 'Signup failed.'}`, 'error');
        }
    } catch (err) {
        showMessage('Network error. Make sure backend is running.', 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign Up with Face';
    }
}

// ─── Login Handler ────────────────────────────────────────────────────────────

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    if (!username) {
        showMessage('Please enter your username.', 'error');
        return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Scanning face...';
    hideMessage();

    try {
        // 1. Get live face descriptor from camera
        const liveDescriptor = await getFaceDescriptor();
        if (!liveDescriptor) {
            showMessage('No face detected! Please look directly at the camera in good lighting.', 'error');
            btn.disabled = false;
            btn.textContent = 'Login with Face';
            return;
        }

        btn.textContent = 'Verifying...';

        // 2. Fetch stored descriptor from backend
        const response = await fetch(`${API_BASE_URL}/get-descriptor/${username}`);
        if (response.status === 404) {
            showMessage(`❌ User "${username}" not found. Please sign up first.`, 'error');
            btn.disabled = false;
            btn.textContent = 'Login with Face';
            return;
        }
        if (!response.ok) {
            showMessage('Server error. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = 'Login with Face';
            return;
        }

        const userData = await response.json();
        const storedDescriptor = new Float32Array(userData.face_descriptor);
        const liveDescriptorFloat = new Float32Array(liveDescriptor);

        // 3. Compare face descriptors in the browser (Euclidean distance)
        const distance = faceapi.euclideanDistance(storedDescriptor, liveDescriptorFloat);
        console.log(`Face distance: ${distance.toFixed(4)}`);

        const THRESHOLD = 0.5; // Lower = stricter. 0.5 is the standard.
        if (distance < THRESHOLD) {
            // Login success!
            document.getElementById('main-container').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            document.getElementById('welcome-message').textContent =
                `Welcome, ${userData.first_name} ${userData.last_name}! 👋`;
        } else {
            showMessage(`❌ Face did not match. Please try again. (Score: ${distance.toFixed(2)})`, 'error');
        }
    } catch (err) {
        showMessage('Network error. Make sure backend is running.', 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login with Face';
    }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadModels();
