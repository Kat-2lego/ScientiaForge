document.addEventListener('DOMContentLoaded', () => {

  // ---------- Initialize Lucide Icons ----------
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // ---------- Sidebar Toggle Logic ----------
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

    // Open file picker
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
      avatarCircle.textContent = '';
    }
  }

  // ---------- Change Password Logic ----------
  const UpdatePasswordBtn =
    document.getElementById('changePasswordBtn');

  if (UpdatePasswordBtn) {
    UpdatePasswordBtn.addEventListener('click', () => {
      window.location.href = 'ForgotPassword.html';
    });
  }

  // ---------- Delete Account Logic ----------
  const deleteAccountBtn =
    document.getElementById('deleteAccountBtn');

  const deleteModal =
    document.getElementById('deleteModal');

  const cancelDeleteBtn =
    document.getElementById('cancelDeleteBtn');

  const confirmDeleteBtn =
    document.getElementById('confirmDeleteBtn');

  const deleteError =
    document.getElementById('deleteError');

  if (
    deleteAccountBtn &&
    deleteModal &&
    cancelDeleteBtn &&
    confirmDeleteBtn &&
    deleteError
  ) {

    // Open confirmation modal
    function openModal() {
      deleteModal.classList.add('open');
      deleteModal.setAttribute('aria-hidden', 'false');

      deleteError.hidden = true;
      deleteError.textContent = '';

      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = 'Confirm deletion';
    }

    // Close confirmation modal
    function closeModal() {
      deleteModal.classList.remove('open');
      deleteModal.setAttribute('aria-hidden', 'true');
    }

    deleteAccountBtn.addEventListener('click', openModal);

    cancelDeleteBtn.addEventListener('click', closeModal);

    const backdrop =
      deleteModal.querySelector('.modal-backdrop');

    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }

    // Confirm account deletion
    confirmDeleteBtn.addEventListener('click', async () => {

      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = 'Deleting...';

      deleteError.hidden = true;
      deleteError.textContent = '';

      try {

        // Retrieve authenticated user's access token
        const accessToken =
          localStorage.getItem('sb-access-token') ||
          sessionStorage.getItem('sb-access-token');

        if (!accessToken) {
          throw new Error(
            'Your session has expired. Please log in again.'
          );
        }

        // Send deletion request to backend
        const response = await fetch('/api/delete-account', {
          method: 'POST',

          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // Read backend response
        const contentType =
          response.headers.get('content-type') || '';

        const body = contentType.includes('application/json')
          ? await response.json()
          : { error: await response.text() };

        if (!response.ok) {
          throw new Error(
            body.error || 'Failed to delete account.'
          );
        }

        // Confirm successful deletion
        if (!body.ok) {
          throw new Error(
            'The server did not confirm account deletion.'
          );
        }

        // Clear authentication and user-specific local data
        const sessionKeys = [
          'sb-access-token',
          'access_token',
          'refresh_token',
          'sb-refresh-token',
          'user',
          'user_id',
          'user_email',
          'isLoggedIn',
          'userAvatar'
        ];

        sessionKeys.forEach((key) => {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        });
        // Store a one-time account deletion confirmation
        sessionStorage.setItem('accountDeletedNotice', 'true');
        
        // Redirect after successful deletion
        window.location.href = '/pages/SignUp.html';

      } catch (error) {

        console.error(
          'DELETE ACCOUNT ERROR:',
          error
        );

        deleteError.textContent =
          error.message ||
          'Something went wrong. Please try again.';

        deleteError.hidden = false;

        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = 'Confirm deletion';
      }

    });

  } else {

    console.warn(
      'Delete account modal elements not found.',
      {
        deleteAccountBtn: Boolean(deleteAccountBtn),
        deleteModal: Boolean(deleteModal),
        cancelDeleteBtn: Boolean(cancelDeleteBtn),
        confirmDeleteBtn: Boolean(confirmDeleteBtn),
        deleteError: Boolean(deleteError),
      }
    );

  }

});


// ---------- Load User Greeting ----------
async function loadUserGreeting() {

  const token =
    localStorage.getItem('sb-access-token') ||
    sessionStorage.getItem('sb-access-token');

  if (!token) {
    window.location.href = '/pages/LogIn.html';
    return;
  }

  try {

    const res = await fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      window.location.href = '/pages/LogIn.html';
      return;
    }

    const { firstName, email } = await res.json();

    const nameEl = document.querySelector('.profile-text h3');
    const emailEl = document.querySelector('.profile-text p');

    if (nameEl) {
      nameEl.textContent = firstName;
    }

    if (emailEl) {
      emailEl.textContent = email;
    }

  } catch (err) {

    console.error('Failed to load user:', err);

  }
}

loadUserGreeting();