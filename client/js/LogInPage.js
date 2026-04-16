  function togglePw() {
    const inp = document.getElementById('sf-pass');
    const icon = document.getElementById('sf-eye-icon');
    if (inp.type === 'password') {
      inp.type = 'text';
      icon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
          a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4
          c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07
          a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
      inp.type = 'password';
      icon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>`;
    }
  }

  function handleSignIn() {
    const email = document.getElementById('sf-email').value.trim();
    const pass  = document.getElementById('sf-pass').value;
    if (!email || !pass) {
      alert('Please fill in all fields.');
      return;
    }
    const btn = document.querySelector('.sf-btn');
    btn.textContent = 'Signing in…';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }, 2000);
  }