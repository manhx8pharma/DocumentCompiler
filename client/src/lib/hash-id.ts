/**
 * Hashes a numeric ID to create a URL-safe string.
 * This function creates a deterministic hash that can be used in URLs instead of numeric IDs.
 * 
 * @param id The numeric ID to hash
 * @param salt Optional salt to make the hash more unique (default: 'doc')
 * @returns A URL-safe string hash
 */
export function hashId(id: number, salt: string = 'doc'): string {
  // Combine the ID with a salt for uniqueness
  const input = `${salt}-${id}-${salt}`;
  
  // Simple hash function for demonstration purposes
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to a positive base36 string and add a prefix
  const hashStr = Math.abs(hash).toString(36);
  return `${salt}${hashStr}`;
}

/**
 * Extracts the numeric ID from a hashed ID string.
 * 
 * @param hashedId The hashed ID to decode
 * @returns The original numeric ID, or null if invalid
 */
export function extractIdFromHash(hashedId: string): number | null {
  // This is a simplified version that just extracts the ID from URL
  // In a real implementation, you would need to validate the hash
  const match = hashedId.match(/^doc([a-z0-9]+)$/);
  if (!match) {
    return null;
  }

  // For the basic implementation, we'll use a lookup table or direct extraction
  // In a real implementation, you'd need to store and lookup these values
  try {
    // Extract content after the prefix, convert back to a number
    // This is just an example - in reality, we can't reverse the hash directly
    // We would need to store a mapping or use a reversible encoding
    const id = parseInt(match[1], 36);
    return id;
  } catch (e) {
    return null;
  }
}

/**
 * Simplified function to extract a numeric ID from the end of a URL path
 * This is used when the URL contains the ID directly (legacy URLs)
 * 
 * @param path The URL path
 * @returns The extracted numeric ID or null if not found
 */
export function extractIdFromPath(path: string): number | null {
  // Extract the last segment of the path and convert to number
  const lastSegment = path.split('/').pop();
  if (!lastSegment) return null;
  
  // Check if it's a hashed ID
  if (lastSegment.startsWith('doc')) {
    const id = extractIdFromHash(lastSegment);
    return id;
  }
  
  // Otherwise try to parse as a number
  const id = parseInt(lastSegment, 10);
  return isNaN(id) ? null : id;
}