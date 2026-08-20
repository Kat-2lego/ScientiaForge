// settings.js
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons (Required for your sidebar and new UI icons)
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Sidebar Toggle Logic
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggle-sidebar');

  if (sidebar && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  // ---------- Avatar Logic ----------
  const avatarContainer = document.querySelector('.avatar-container');
  const avatarCircle = document.querySelector('.avatar-circle');

  if (avatarContainer && avatarCircle) {
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Load saved avatar
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
      setAvatar(savedAvatar);
    }

    // Click avatar → open file picker
    avatarContainer.addEventListener('click', () => {
      fileInput.click();
    });

    // Handle image selection
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target.result;
        setAvatar(imageData);
        localStorage.setItem('userAvatar', imageData);
      };
      reader.readAsDataURL(file);
    });

    function setAvatar(imageSrc) {
      avatarCircle.style.backgroundImage = `url(${imageSrc})`;
      avatarCircle.style.backgroundSize = 'cover';
      avatarCircle.style.backgroundPosition = 'center';
      avatarCircle.textContent = ''; // remove "TM"
    }
  }

  // ---------- Delete Account Logic ----------
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  const deleteModal = document.getElementById('deleteModal');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const deleteError = document.getElementById('deleteError');

  if (
    deleteAccountBtn &&
    deleteModal &&
    cancelDeleteBtn &&
    confirmDeleteBtn &&
    deleteError
  ) {
    function openModal() {
      deleteModal.classList.add('open');
      deleteModal.setAttribute('aria-hidden', 'false');
      deleteError.hidden = true;
      deleteError.textContent = '';
      confirmDeleteBtn.disabled = false;
    }

    function closeModal() {
      deleteModal.classList.remove('open');
      deleteModal.setAttribute('aria-hidden', 'true');
    }

    // Open modal on "Delete Account" click in settings
    deleteAccountBtn.addEventListener('click', openModal);

    // Cancel
    cancelDeleteBtn.addEventListener('click', closeModal);

    // Close on backdrop click
    const backdrop = deleteModal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }

    // Confirm delete
    // confirmDeleteBtn.addEventListener('click', async () => {
    //   confirmDeleteBtn.disabled = true;
    //   deleteError.hidden = true;
    //   deleteError.textContent = '';

    //   try {
    //     if (!window.supabase) {
    //       throw new Error('Supabase client not found on window');
    //     }

    //     const { data: { session }, error: sessionError } =
    //       await window.supabase.auth.getSession();

    //     if (sessionError || !session?.access_token) {
    //       throw new Error('Not logged in');
    //     }

    //     const token = session.access_token;

    //     const res = await fetch('/api/delete-account', {
    //       method: 'POST',
    //       headers: {
    //         'Content-Type': 'application/json',
    //         Authorization: `Bearer ${token}`,
    //       },
    //     });

    //     const body = await res.json();

    //     if (!res.ok) {
    //       throw new Error(body.error || 'Failed to delete account');
    //     }

    //     await window.supabase.auth.signOut();
    //     window.location.href = '/signup.html'; // adjust to your signup page path
    //   } catch (err) {
    //     console.error(err);
    //     deleteError.textContent = err.message || 'Something went wrong. Please try again.';
    //     deleteError.hidden = false;
    //     confirmDeleteBtn.disabled = false;
    //   }
    // });
    confirmDeleteBtn.addEventListener('click', async () => {
  confirmDeleteBtn.disabled = true;
  deleteError.hidden = true;
  deleteError.textContent = '';

  try {
    if (!window.supabase) {
      throw new Error('Supabase client not found on window');
    }

    const { data: { session }, error: sessionError } =
      await window.supabase.auth.getSession();

    console.log('getSession result:', { session, sessionError });
    console.log('session?.access_token:', session?.access_token);

    if (sessionError || !session?.access_token) {
      console.warn('No valid session:', { sessionError, session });
      throw new Error('Not logged in');
    }

    const token = session.access_token;

    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || 'Failed to delete account');
    }

    await window.supabase.auth.signOut();
    window.location.href = '/signup.html';
  } catch (err) {
    console.error(err);
    deleteError.textContent = err.message || 'Something went wrong. Please try again.';
    deleteError.hidden = false;
    confirmDeleteBtn.disabled = false;
  }
});
  } else {
    console.warn(
      'Delete account modal elements not found. Check IDs in HTML:',
      {
        deleteAccountBtn: !!deleteAccountBtn,
        deleteModal: !!deleteModal,
        cancelDeleteBtn: !!cancelDeleteBtn,
        confirmDeleteBtn: !!confirmDeleteBtn,
        deleteError: !!deleteError,
      }
    );
  }
});


// ---------- Load User Greeting ----------
async function loadUserGreeting() {
  const token = localStorage.getItem('sb-access-token');
  if (!token) {
    window.location.href = '/pages/LogIn.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      window.location.href = '/pages/LogIn.html';
      return;
    }

    const { firstName, email } = await res.json();

    const nameEl = document.querySelector('.profile-text h3');
    const emailEl = document.querySelector('.profile-text p');

    if (nameEl) nameEl.textContent = `${firstName}`;
    if (emailEl) emailEl.textContent = email;
  } catch (err) {
    console.error('Failed to load user:', err);
  }
}

loadUserGreeting();