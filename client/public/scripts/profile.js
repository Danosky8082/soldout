
import jwt_decode from 'jwt-decode';

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Get user ID from token
    const decoded = jwt_decode(token);
    const userId = decoded.id;

    // Fetch user profile data
    try {
        const response = await fetch(`/api/users/${userId}/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile data');
        }

        const userData = await response.json();

        // Display user data
        document.getElementById('profileName').textContent = `${userData.firstName} ${userData.lastName}`;
        document.getElementById('profileEmail').textContent = userData.email;
        document.getElementById('profileJoinDate').textContent = `Member since ${new Date(userData.createdAt).toLocaleDateString()}`;
        document.getElementById('profileBio').textContent = userData.bio || 'No bio yet';

        // Display stats
        document.getElementById('videosCount').textContent = userData.stats.videos;
        document.getElementById('viewsCount').textContent = userData.stats.views;
        document.getElementById('likesCount').textContent = userData.stats.likes;
        document.getElementById('subscribersCount').textContent = userData.stats.subscribers;

        // Display profile picture if available
        if (userData.profilePicture) {
            document.getElementById('profilePicture').src = userData.profilePicture;
        }

        // Display user videos if available
        if (userData.videos && userData.videos.length > 0) {
            document.getElementById('noVideosMessage').style.display = 'none';
            const videosGrid = document.getElementById('userVideosGrid');
            
            userData.videos.forEach(video => {
                const videoElement = document.createElement('div');
                videoElement.className = 'video-item';
                videoElement.innerHTML = `
                    <img src="${video.thumbnail}" alt="${video.title}">
                    <div class="video-info">
                        <h3>${video.title}</h3>
                        <p>${video.views} views</p>
                        <p>${video._count.likes} likes</p>
                    </div>
                `;
                videosGrid.appendChild(videoElement);
            });
        }

    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Failed to load profile data');
    }

    // Profile picture upload functionality
    const profilePictureContainer = document.getElementById('profilePictureContainer');
    const profilePictureUpload = document.getElementById('profilePictureUpload');

    profilePictureContainer.addEventListener('click', function() {
        profilePictureUpload.click();
    });

    profilePictureUpload.addEventListener('change', async function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('profilePicture', file);

            try {
                const response = await fetch(`/api/users/${userId}/profile-picture`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Failed to upload profile picture');
                }

                const result = await response.json();
                document.getElementById('profilePicture').src = result.profilePictureUrl;
                alert('Profile picture updated successfully!');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                alert('Failed to upload profile picture');
            }
        }
    });

    // Edit profile functionality
    const editProfileBtn = document.getElementById('editProfileBtn');
    const editProfileModal = document.getElementById('editProfileModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    editProfileBtn.addEventListener('click', function() {
        // Populate the edit form with current data
        const userData = {
            firstName: document.getElementById('profileName').textContent.split(' ')[0],
            lastName: document.getElementById('profileName').textContent.split(' ')[1],
            email: document.getElementById('profileEmail').textContent,
            bio: document.getElementById('profileBio').textContent
        };

        document.getElementById('editFirstName').value = userData.firstName;
        document.getElementById('editLastName').value = userData.lastName;
        document.getElementById('editEmail').value = userData.email;
        document.getElementById('editBio').value = userData.bio;

        editProfileModal.style.display = 'flex';
    });

    closeEditModal.addEventListener('click', function() {
        editProfileModal.style.display = 'none';
    });

    cancelEditBtn.addEventListener('click', function() {
        editProfileModal.style.display = 'none';
    });

    saveProfileBtn.addEventListener('click', async function() {
        const updatedData = {
            firstName: document.getElementById('editFirstName').value,
            lastName: document.getElementById('editLastName').value,
            email: document.getElementById('editEmail').value,
            bio: document.getElementById('editBio').value
        };

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updatedData)
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            const result = await response.json();

            // Update the displayed profile
            document.getElementById('profileName').textContent = `${result.firstName} ${result.lastName}`;
            document.getElementById('profileEmail').textContent = result.email;
            document.getElementById('profileBio').textContent = result.bio || 'No bio yet';

            editProfileModal.style.display = 'none';
            alert('Profile updated successfully!');
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile');
        }
    });

    // Logout functionality
    const logoutBtns = document.querySelectorAll('.logout-btn, #logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    });

    // Upload video buttons
    const uploadVideoBtns = document.querySelectorAll('#uploadVideoBtn, #uploadVideoBtn2');
    uploadVideoBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            window.location.href = '/upload.html';
        });
    });
});