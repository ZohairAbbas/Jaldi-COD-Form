/**
 * Mixpanel Client-Side Tracking Utility
 *
 * Handles all client-side analytics tracking including:
 * - Session recording
 * - User identification
 * - Event tracking with properties
 * - Page views
 * - User properties
 */

import mixpanel from 'mixpanel-browser';

let isInitialized = false;

/**
 * Initialize Mixpanel with session recording enabled
 */
export function initMixpanel(token, config = {}) {
  if (isInitialized) return;

  if (!token) {
    console.warn('Mixpanel token not provided');
    return;
  }

  mixpanel.init(token, {
    debug: process.env.NODE_ENV === 'development',
    track_pageview: true,
    persistence: 'localStorage',
    // Enable session recording
    record_sessions_percent: 100, // Record 100% of sessions (adjust as needed)
    record_block_selector: '.sensitive-data', // Block sensitive data from recording
    record_mask_text_selector: '.mask-text', // Mask text in recordings
    record_collect_fonts: true,
    // Privacy settings
    property_blacklist: ['password', 'credit_card', 'ssn'],
    ...config,
  });

  isInitialized = true;
  console.log('Mixpanel initialized with session recording');
}

/**
 * Identify user with unique ID and properties
 */
export function identifyUser(userId, userProperties = {}) {
  if (!isInitialized) return;

  mixpanel.identify(userId);

  if (Object.keys(userProperties).length > 0) {
    mixpanel.people.set(userProperties);
  }
}

/**
 * Set user properties
 */
export function setUserProperties(properties) {
  if (!isInitialized) return;
  mixpanel.people.set(properties);
}

/**
 * Increment user property
 */
export function incrementUserProperty(property, value = 1) {
  if (!isInitialized) return;
  mixpanel.people.increment(property, value);
}

/**
 * Track an event with properties
 */
export function trackEvent(eventName, properties = {}) {
  if (!isInitialized) return;

  // Add common properties
  const enrichedProperties = {
    ...properties,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer,
  };

  mixpanel.track(eventName, enrichedProperties);
  console.log(`[Mixpanel] Event tracked: ${eventName}`, enrichedProperties);
}

/**
 * Track page view
 */
export function trackPageView(pageName, properties = {}) {
  trackEvent('Page View', {
    page_name: pageName,
    ...properties,
  });
}

/**
 * Start a session recording explicitly
 */
export function startSessionRecording() {
  if (!isInitialized) return;
  // Mixpanel automatically records sessions when initialized with record_sessions_percent
  console.log('Session recording active');
}

/**
 * Track timing event (how long something took)
 */
export function trackTiming(eventName, durationMs, properties = {}) {
  trackEvent(eventName, {
    ...properties,
    duration_ms: durationMs,
    duration_seconds: Math.round(durationMs / 1000),
  });
}

/**
 * Reset user identity (on logout)
 */
export function resetUser() {
  if (!isInitialized) return;
  mixpanel.reset();
}

/**
 * Track error
 */
export function trackError(errorName, errorDetails = {}) {
  trackEvent('Error Occurred', {
    error_name: errorName,
    ...errorDetails,
  });
}

/**
 * Set super properties (sent with every event)
 */
export function setSuperProperties(properties) {
  if (!isInitialized) return;
  mixpanel.register(properties);
}

/**
 * Clear all super properties
 */
export function clearSuperProperties() {
  if (!isInitialized) return;
  mixpanel.unregister_all();
}

// Export mixpanel instance for advanced usage
export { mixpanel };
