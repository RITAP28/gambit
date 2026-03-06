const config = {
    ENV: import.meta.env.VITE_CLIENT_ENV,
    DEV_BASE_URL: 'http://localhost:7070/api',
    PROD_BASE_URL: '',
    DEV_WS_URL: 'ws://localhost:8080',
    PROD_WS_URL: ''
}

export default config;