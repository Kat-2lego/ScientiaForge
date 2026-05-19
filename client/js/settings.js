document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons (Required for your sidebar and new UI icons)
    lucide.createIcons();

    // Sidebar Toggle Logic
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
    });

    // Avatar Upload Simulation
    const avatar = document.querySelector('.avatar-container');
    avatar.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
            const file = e.target.files[0];
            // In a real app, this would upload the file to your backend
            alert(`Ready to upload new avatar: ${file.name}`);
        };
        input.click();
    });
});

document.addEventListener("DOMContentLoaded", () => {

    const avatarContainer = document.querySelector(".avatar-container");
    const avatarCircle = document.querySelector(".avatar-circle");

    // 🔥 Create hidden file input (no HTML changes)
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    // 🔥 Load saved avatar
    const savedAvatar = localStorage.getItem("userAvatar");
    if (savedAvatar) {
        setAvatar(savedAvatar);
    }

    // 🔥 Click avatar → open file picker
    avatarContainer.addEventListener("click", () => {
        fileInput.click();
    });

    // 🔥 Handle image selection
    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image file.");
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const imageData = e.target.result;

            setAvatar(imageData);

            // Save
            localStorage.setItem("userAvatar", imageData);
        };

        reader.readAsDataURL(file);
    });

    // 🔥 Function to apply avatar
    function setAvatar(imageSrc) {
        avatarCircle.style.backgroundImage = `url(${imageSrc})`;
        avatarCircle.style.backgroundSize = "cover";
        avatarCircle.style.backgroundPosition = "center";
        avatarCircle.textContent = ""; // remove "TM"
    }

});

async function loadUserGreeting() {
  // Get the token saved after login
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return window.location.href = "/pages/LogIn.html";

    const { firstName, email } = await res.json();

    document.querySelector(".profile-text h3").textContent = `${firstName}`;
    document.querySelector(".profile-text p").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

loadUserGreeting();