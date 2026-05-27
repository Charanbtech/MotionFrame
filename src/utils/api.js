/**
 * Centralized API configuration and utility functions
 * This ensures all API calls use the correct base URL from environment variables
 */

const API_BASE_URL = import.meta?.env?.VITE_API_BASE_URL || "";

/**
 * Get the full API URL for an endpoint
 * @param {string} endpoint - API endpoint (e.g., '/api/login' or 'api/login')
 * @returns {string} Full URL
 */
export const getApiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Ensure endpoint starts with /api
  const apiEndpoint = cleanEndpoint.startsWith('/api') ? cleanEndpoint : `/api${cleanEndpoint}`;
  return `${API_BASE_URL}${apiEndpoint}`;
};

/**
 * Get the base URL for static file uploads
 * @returns {string} Base URL for uploads
 */
export const getUploadsUrl = () => {
  return `${API_BASE_URL}/uploads`;
};

/**
 * Get the full URL for an uploaded file
 * @param {string} filepath - File path relative to uploads directory
 * @returns {string} Full URL to the file
 */
export const getFileUrl = (filepath) => {
  // Normalize file path (replace backslashes with forward slashes)
  const normalizedPath = filepath.replace(/\\/g, '/');
  return `${API_BASE_URL}/uploads/${normalizedPath}`;
};

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(getApiUrl(endpoint), {
    ...options,
    headers,
  });

  return response;
};

/**
 * Make an authenticated API request and parse JSON response
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Parsed JSON response
 */
export const apiRequestJson = async (endpoint, options = {}) => {
  const response = await apiRequest(endpoint, options);
  return response.json();
};

// Export the base URL for direct use if needed
export { API_BASE_URL };






