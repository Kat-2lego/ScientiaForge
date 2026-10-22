// Get access_token from URL hash (Supabase puts it there after clicking the reset link)
const params = new URLSearchParams(window.location.hash.substring(1));
const access_token = params.get('access_token');

// If no token found, the user shouldn't be on this page
if (!access_token) {
    alert('Invalid or expired reset link. Please request a new one.');
    window.location.href = '/forgot-password';
}

// Password strength checker
document.getElementById('new-password').addEventListener('input', function () {
    const val = this.value;
    const strength = getStrength(val);
    updateStrengthBar(strength);
});

function getStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
}

function updateStrengthBar(score) {
    const bars = ['bar1', 'bar2', 'bar3', 'bar4'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    bars.forEach((id, i) => {
        const bar = document.getElementById(id);
        bar.style.background = i < score ? colors[score - 1] : '#e5e7eb';
    });

    document.getElementById('strength-label').textContent = score > 0 ? labels[score] : '';
    document.getElementById('strength-label').style.color = score > 0 ? colors[score - 1] : '#9ca3af';
}

function toggleVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleReset() {
    const newPassword = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    const passwordError = document.getElementById('password-error');
    const confirmError = document.getElementById('confirm-error');
    const submitBtn = document.getElementById('submit-btn');
    const successBox = document.getElementById('success-box');

    // Reset errors
    passwordError.classList.remove('visible');
    confirmError.classList.remove('visible');
    document.getElementById('new-password').classList.remove('error-input');
    document.getElementById('confirm-password').classList.remove('error-input');

    let valid = true;

    if (!newPassword || newPassword.length < 8) {
        passwordError.classList.add('visible');
        document.getElementById('new-password').classList.add('error-input');
        valid = false;
    }

    if (newPassword !== confirmPassword) {
        confirmError.classList.add('visible');
        document.getElementById('confirm-password').classList.add('error-input');
        valid = false;
    }

    if (!valid) return;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Resetting...';

    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token, new_password: newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            passwordError.textContent = data.error || 'Something went wrong.';
            passwordError.classList.add('visible');
            return;
        }

        successBox.classList.add('visible');
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        updateStrengthBar(0);

    } catch (err) {
        passwordError.textContent = 'Something went wrong. Please try again.';
        passwordError.classList.add('visible');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Reset password';
    }
}

document.getElementById('submit-btn').addEventListener('click', handleReset);

document.getElementById('confirm-password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleReset();
});