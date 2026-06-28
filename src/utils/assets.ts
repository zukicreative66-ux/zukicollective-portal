/**
 * Assets Utility Manager
 * 
 * To prevent local compilation errors (like "Failed to resolve import") on different 
 * developer environments where raw asset files might be missing or structured differently, 
 * this file serves as the single source of truth for Zuki Creatives' visual assets.
 * 
 * Instructions to swap for local files or Supabase Storage:
 * 1. For local files: Place your images in the `public` folder (e.g. `public/logo.jpg`) 
 *    and reference them as root paths (e.g. `"/logo.jpg"`). This avoids Vite import bundling issues.
 * 2. For remote storage (Supabase): Paste your public bucket URL directly as a string.
 */

// Elegant abstract design agency placeholders from Unsplash (fitting the Peach, Cream & Brown warm brand palette)
import logoImg from '../assets/images/zukilogo.svg';
import coverImg from '../assets/images/cover_zuki_1782392733832.png';

// Elegant abstract design agency placeholders from Unsplash (fitting the Peach, Cream & Brown warm brand palette)
    const BRAND_LOGO_FALLBACK = "https://images.unsplash.com/photo-1561070791-2526d30994b5?q=80&w=300&auto=format&fit=crop"; // Warm abstract color block representing creatives
    const BRAND_COVER_FALLBACK = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop"; // High-end dark/peach abstract wave

    export const logoZuki = logoImg || BRAND_LOGO_FALLBACK;
    export const coverZuki = coverImg || BRAND_COVER_FALLBACK;
