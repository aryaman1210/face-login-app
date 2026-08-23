const API_BASE_URL = 'http://localhost:8000/api'; // Update this when deploying

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cameraStatus = document.getElementById('camera-status');
const statusMessage = document.getElementById('status-message');

let stream = null;

// Initialize Webcam
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        cameraStatus.style.display = 'none';
    } catch (err) {
        console.error("Error accessing the camera", err);
        cameraStatus.textContent = "Camera access denied or unavailable.";
    }
}

// Switch between Login and Signup tabs
function switchTab(tab) {
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-signup').classList.remove('active');
    
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'none';
    
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`${tab}-form`).style.display = 'flex';
    
    hideMessage();
}

// Capture a frame from the video stream and return as Base64
function captureFrame() {
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // get base64 string
    return canvas.toDataURL('image/jpeg');
}

function showMessage(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `message ${type}`;
}

function hideMessage() {
    statusMessage.className = 'message';
    statusMessage.style.display = 'none';
}

function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = "Processing...";
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText;
    }
}

// Handle Sign Up
async function handleSignup() {
    const username = document.getElementById('signup-username').value;
    const firstName = document.getElementById('signup-first-name').value;
    const lastName = document.getElementById('signup-last-name').value;

    if (!username || !firstName || !lastName) {
        showMessage("Please fill all fields.", "error");
        return;
    }

    if (!stream) {
        showMessage("Camera not available.", "error");
        return;
    }

    const imageBase64 = captureFrame();
    setLoading('btn-signup', true);
    hideMessage();

    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                first_name: firstName,
                last_name: lastName,
                image_base64: imageBase64
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage("Sign up successful! You can now login.", "success");
            setTimeout(() => switchTab('login'), 2000);
        } else {
            showMessage(data.detail || "Sign up failed.", "error");
        }
    } catch (err) {
        showMessage("Network error. Make sure backend is running.", "error");
    } finally {
        setLoading('btn-signup', false);
    }
}

// Handle Login
async function handleLogin() {
    const username = document.getElementById('login-username').value;

    if (!username) {
        showMessage("Please enter your username.", "error");
        return;
    }

    if (!stream) {
        showMessage("Camera not available.", "error");
        return;
    }

    const imageBase64 = captureFrame();
    setLoading('btn-login', true);
    hideMessage();

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                image_base64: imageBase64
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Login successful
            document.querySelector('.container').style.display = 'none';
            const dashboard = document.getElementById('dashboard');
            dashboard.style.display = 'block';
            
            document.getElementById('welcome-message').textContent = `Welcome, ${data.first_name} ${data.last_name}!`;
            
            // Stop the camera to save resources
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        } else {
            // Face did not match or user not found
            showMessage(data.message || data.detail || "Login failed.", "error");
        }
    } catch (err) {
        console.error(err);
        showMessage("Network error. Make sure backend is running.", "error");
    } finally {
        setLoading('btn-login', false);
    }
}

function logout() {
    document.getElementById('dashboard').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    document.getElementById('login-username').value = '';
    hideMessage();
    // Re-initialize camera
    initCamera();
}

// Start camera when page loads
window.onload = initCamera;
