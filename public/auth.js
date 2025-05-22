document.getElementById('btn-login').addEventListener('click', async () => {
    document.querySelectorAll('section > form').forEach(form => form.parentElement.remove());
    fetch('/api/serveForm/login')
        .then(response => response.text())
        .then(html => document.querySelector('main').insertAdjacentHTML('beforeend', html))
        .catch(error => console.error('Error:', error));
});
document.getElementById('btn-register').addEventListener('click', async () => {
    document.querySelectorAll('section > form').forEach(form => form.parentElement.remove());
    fetch('/api/serveForm/register')
        .then(response => response.text())
        .then(html => document.querySelector('main').insertAdjacentHTML('beforeend', html))
        .catch(error => console.error('Error:', error));
});

// Add this function to check email before form submission
function checkEmailAvailability(email) {
    return new Promise((resolve, reject) => {
        fetch('/api/user/check-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    reject(data.error);
                } else {
                    resolve(data.exists);
                }
            })
            .catch(error => {
                reject(error);
            });
    });
}

function handleRegistration(e) {
    e.preventDefault();
    const errorElement = document.getElementById('register-error');
    const formData = new FormData(e.target);
    const { email, password, username, confirmPassword } = Object.fromEntries(formData.entries());

    errorElement.style.display = 'none';

    // Password validation
    if (password !== confirmPassword) {
        errorElement.style.display = 'block';
        errorElement.textContent = 'Пароли не совпадают';
        return;
    }

    if (email && password && username) {
        // Show loading state
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Проверка...';

        // Check if email exists before attempting registration
        checkEmailAvailability(email)
            .then(exists => {
                if (exists) {
                    errorElement.style.display = 'block';
                    errorElement.textContent = 'Этот email уже зарегистрирован';
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                } else {
                    // Email is available, proceed with registration
                    fetch('/api/user/auth', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password, username, action: 'register' })
                    })
                        .then(response => response.json())
                        .then(data => {
                            submitButton.disabled = false;
                            submitButton.textContent = originalButtonText;

                            if (data.error) {
                                errorElement.style.display = 'block';
                                if (data.error.includes('already registered')) {
                                    errorElement.textContent = 'Этот email уже зарегистрирован';
                                } else if (data.error.includes('password')) {
                                    errorElement.textContent = 'Требуется более надежный пароль';
                                } else {
                                    errorElement.textContent = 'Что-то пошло не так: ' + data.error;
                                }
                                console.error('Error:', data.error);
                            } else {
                                // Clear form
                                e.target.reset();
                                errorElement.style.display = 'block';
                                errorElement.style.color = 'green';
                                errorElement.textContent = 'Проверьте ваш имейл';
                            }
                        })
                        .catch(error => {
                            submitButton.disabled = false;
                            submitButton.textContent = originalButtonText;
                            errorElement.style.display = 'block';
                            errorElement.textContent = 'Ошибка сервера. Попробуйте позже.';
                            console.error('Error:', error);
                        });
                }
            })
            .catch(error => {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
                errorElement.style.display = 'block';
                errorElement.textContent = 'Ошибка при проверке email';
                console.error('Error:', error);
            });
    } else {
        errorElement.style.display = 'block';
        errorElement.textContent = 'Пожалуйста, заполните все поля';
        console.error('Error: Missing required fields');
    }
}

function handleLogin(e) {
    e.preventDefault();
    const errorElement = document.getElementById('login-error');
    const formData = new FormData(e.target);
    const { email, password } = Object.fromEntries(formData.entries());

    errorElement.style.display = 'none';

    if (email && password) {
        fetch('/api/user/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, action: 'login' })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    errorElement.style.display = 'block';
                    if (data.error === 'Email not confirmed') {
                        errorElement.textContent = 'Сначала подтвердите почту';
                    } else if (data.error.includes('Invalid login credentials')) {
                        errorElement.textContent = 'Неверный email или пароль';
                    } else {
                        errorElement.textContent = 'Ошибка: ' + data.error;
                    }
                    console.error('Error:', data.error);
                } else {
                    window.location.href = '/wiki';
                }
            })
            .catch(error => {
                errorElement.style.display = 'block';
                errorElement.textContent = 'Ошибка сервера. Попробуйте позже.';
                console.error('Error:', error);
            });
    } else {
        errorElement.style.display = 'block';
        errorElement.textContent = 'Пожалуйста, заполните все поля';
        console.error('Error: Missing required fields');
    }
}

// Check session status on page load
document.addEventListener('DOMContentLoaded', () => {
    // Only check auth and redirect if we're on the login page
    if (window.location.pathname === '/' || window.location.pathname === '/auth.html') {
        fetch('/api/user/check-auth')
            .then(response => response.json())
            .then(data => {
                if (data.authenticated) {
                    // If authenticated and on login page, redirect to wiki
                    window.location.href = '/wiki';
                }
            })
            .catch(error => console.error('Auth check error:', error));
    }
});