/// <reference types="vite/client" />

declare const __TIDE_ART_MODE__: 'original' | 'reference';

declare module '*.png' {
    const value: string; // Defines the import as a string (URL)
    export default value;
}

// Add this declaration for CSS files
declare module '*.css';
