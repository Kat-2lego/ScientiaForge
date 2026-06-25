async function handleSubmit() {
    const emailInput = document.getElementById('email');
    const errorMsg = document.getElementById('error-msg');
    const submitBtn = document.getElementById('submit-btn');
    const successBox = document.getElementById('success-box');

    const email = emailInput.value.trim();

    // Reset state
    emailInput.classList.remove('error-input');
    errorMsg.classList.remove('visible');
    successBox.classList.remove('visible');

    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        emailInput.classList.add('error-input');
        errorMsg.classList.add('visible');
        return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Sending...';

    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        // Always show success (don't reveal if email exists or not)
        successBox.classList.add('visible');
        emailInput.value = '';

        } catch (err) {
            errorMsg.textContent = 'Something went wrong. Please try again.';
            errorMsg.classList.add('visible');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Send reset link';
        }
    }

// Allow pressing Enter to submit
document.getElementById('email').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleSubmit();
});