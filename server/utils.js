require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const cookie = require('cookie');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Supabase credentials are missing in .env file.');
    console.error('Please create a .env file with SUPABASE_URL and SUPABASE_KEY.');
    process.exit(1);
}

console.log('Initializing Supabase client with URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

// Test Supabase connection
(async () => {
    try {
        const { data, error } = await supabase.from('_dummy_query_for_connection_test').select('*').limit(1);
        if (error && error.code !== '42P01') { // 42P01 is a "relation does not exist" error which is expected
            console.error('ERROR: Could not connect to Supabase:', error);
        } else {
            console.log('Successfully connected to Supabase!');
        }
    } catch (err) {
        console.error('ERROR: Failed to test Supabase connection:', err);
    }
})();

// Parse request body for POST requests
const parseBody = async (req) => {
    return new Promise((resolve, reject) => {
        if (req.method !== 'POST') {
            resolve({});
            return;
        }

        if (req.headers['content-type'] !== 'application/json') {
            console.warn('Request Content-Type is not application/json:', req.headers['content-type']);
        }

        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            if (!body) {
                console.warn('Empty request body received');
                resolve({});
                return;
            }

            try {
                const parsedBody = JSON.parse(body);
                console.log('Parsed request body:', JSON.stringify(parsedBody, (key, value) => {
                    if (key === 'password') return '***';
                    return value;
                }));
                resolve(parsedBody);
            } catch (error) {
                console.error('Error parsing request body:', error, 'Raw body:', body);
                reject(new Error(`Failed to parse request body: ${error.message}`));
            }
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });
    });
};

// Handle session cookies
const setCookie = (res, name, value, options = {}) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        path: '/',
        ...options
    };

    const cookieString = cookie.serialize(name, value, cookieOptions);

    // Check if existing Set-Cookie header exists
    const existingCookies = res.getHeader('Set-Cookie');

    if (existingCookies) {
        // If it's an array, push new cookie
        if (Array.isArray(existingCookies)) {
            res.setHeader('Set-Cookie', [...existingCookies, cookieString]);
        } else {
            // If it's a string, convert to array with new cookie
            res.setHeader('Set-Cookie', [existingCookies, cookieString]);
        }
    } else {
        // No existing cookies
        res.setHeader('Set-Cookie', cookieString);
    }
};

const parseCookies = (req) => {
    return cookie.parse(req.headers.cookie || '');
};

const clearCookie = (res, name) => {
    setCookie(res, name, '', { maxAge: 0 });
};

// Helper to verify session before allowing access to protected routes
const verifySession = async (req) => {
    const cookies = parseCookies(req);
    const accessToken = cookies.access_token;
    const refreshToken = cookies.refresh_token;
    const sessionToken = cookies.sb_session;

    // Try with access token first
    if (accessToken) {
        try {
            const { data, error } = await supabase.auth.getUser(accessToken);
            if (!error && data.user) {
                return { authorized: true, user: data.user };
            }
        } catch (error) {
            console.error('Error verifying access token:', error);
        }
    }

    // Try with refresh token if access token failed
    if (refreshToken) {
        try {
            const { data, error } = await supabase.auth.refreshSession({
                refresh_token: refreshToken
            });

            if (!error && data.session) {
                return { authorized: true, user: data.user };
            }
        } catch (error) {
            console.error('Error refreshing token:', error);
        }
    }

    // Finally try with session token if both previous methods failed
    if (sessionToken) {
        try {
            const { data, error } = await supabase.auth.getUser(sessionToken);
            if (!error && data.user) {
                return { authorized: true, user: data.user };
            }
        } catch (error) {
            console.error('Error verifying session token:', error);
        }
    }

    return { authorized: false };
};

module.exports = {
    supabase,
    parseBody,
    setCookie,
    parseCookies,
    clearCookie,
    verifySession
};