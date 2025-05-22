const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { parseBody, setCookie, parseCookies, clearCookie } = require('./utils');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function isAuth(req, res) {
    try {
        const cookies = parseCookies(req);
        const accessToken = cookies.access_token;
        const refreshToken = cookies.refresh_token;

        // If no tokens in cookies, check for session cookie
        if (!accessToken && !refreshToken) {
            const sessionCookie = cookies.sb_session;

            if (sessionCookie) {
                // Try to get user with session cookie
                const { data, error } = await supabase.auth.getUser(sessionCookie);

                if (!error && data.user) {
                    // Create proper auth cookies from session
                    const authResponse = await supabase.auth.setSession({
                        access_token: sessionCookie,
                        refresh_token: '' // We don't have refresh token from cookie
                    });

                    if (!authResponse.error) {
                        // Set proper cookies
                        setAuthCookies(res, authResponse.data.session);
                        return sendResponse(res, 200, { authenticated: true, user: data.user });
                    }
                }
            }

            return sendResponse(res, 401, { authenticated: false });
        }

        // Verify session with access token
        const { data, error } = await supabase.auth.getUser(accessToken);

        if (error) {
            // Try to refresh the token if we have a refresh token
            if (refreshToken) {
                const refreshResult = await supabase.auth.refreshSession({
                    refresh_token: refreshToken,
                });

                if (refreshResult.error) {
                    clearAuthCookies(res);
                    return sendResponse(res, 401, { authenticated: false });
                }

                // Set new tokens as cookies
                setAuthCookies(res, refreshResult.data.session);
                return sendResponse(res, 200, { authenticated: true, user: refreshResult.data.user });
            } else {
                clearAuthCookies(res);
                return sendResponse(res, 401, { authenticated: false });
            }
        }

        return sendResponse(res, 200, { authenticated: true, user: data.user });
    } catch (error) {
        console.error('Auth check error:', error);
        return sendResponse(res, 500, { authenticated: false, error: 'Server error' });
    }
}

async function checkEmailExists(req, res) {
    try {
        const { email } = await parseBody(req);

        if (!email) {
            return sendResponse(res, 400, { error: 'Email is required' });
        }

        // Simple approach that uses signInWithOtp to check if an email exists
        // This method doesn't create temporary users and doesn't send emails
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                // Setting shouldCreateUser to false means it will only work for existing users
                shouldCreateUser: false
            }
        });

        // If there's an error saying "Email not found" or similar, the email doesn't exist
        if (error && (error.message.includes('Email not found') ||
            error.message.includes('Invalid login credentials'))) {
            return sendResponse(res, 200, { exists: false });
        } else if (error) {
            // If there's another error, log it but don't expose details to client
            console.error('Error checking email:', error);
            return sendResponse(res, 500, { error: 'Server error checking email' });
        } else {
            // If no error, the email exists (OTP was sent)
            return sendResponse(res, 200, { exists: true });
        }
    } catch (error) {
        console.error('Email check error:', error);
        return sendResponse(res, 500, { error: 'Server error' });
    }
}

async function handleLogout(req, res) {
    try {
        const cookies = parseCookies(req);
        const accessToken = cookies.access_token;

        if (accessToken) {
            await supabase.auth.signOut({ accessToken });
        }

        clearAuthCookies(res);
        sendResponse(res, 200, { success: true });
    } catch (error) {
        console.error('Logout error:', error);
        sendResponse(res, 500, { error: 'Logout failed' });
    }
}

async function handleAuth(req, res) {
    try {
        const { email, password, action, username } = await parseBody(req);

        if (action === 'register') {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username }
                }
            });

            if (error) {
                return sendResponse(res, 400, { error: error.message });
            }

            // No need to set cookies for registration since email confirmation is required
            return sendResponse(res, 200, {
                user: data.user,
                message: 'Registration successful. Please check your email to confirm your account.'
            });
        } else if (action === 'login') {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return sendResponse(res, 400, { error: error.message });
            }

            // Set auth cookies
            setAuthCookies(res, data.session);

            // Also set the session cookie that Supabase might use
            setCookie(res, 'sb_session', data.session.access_token, {
                maxAge: 3600 * 24 * 7, // 1 week
                httpOnly: true
            });

            return sendResponse(res, 200, {
                user: data.user,
                session: {
                    expires_at: data.session.expires_at
                }
            });
        }

        return sendResponse(res, 400, { error: 'Invalid action' });
    } catch (error) {
        console.error('Auth error:', error);
        sendResponse(res, 500, { error: 'Server error' });
    }
}

function setAuthCookies(res, session) {
    // Set http-only cookies for auth tokens
    setCookie(res, 'access_token', session.access_token, {
        maxAge: 3600 * 24 * 7, // 1 week
        httpOnly: true
    });

    setCookie(res, 'refresh_token', session.refresh_token, {
        maxAge: 3600 * 24 * 30, // 30 days
        httpOnly: true
    });
}

function clearAuthCookies(res) {
    clearCookie(res, 'access_token');
    clearCookie(res, 'refresh_token');
    clearCookie(res, 'sb_session');
}

function sendResponse(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

module.exports = {
    isAuth,
    handleLogout,
    handleAuth,
    checkEmailExists
};