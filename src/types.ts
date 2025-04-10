// types.ts

/**
 * Interface for SiliconFlow Flux image generation arguments
 */
export interface ImageGenerationArgs {
    /**
     * Text prompt for image generation. Please provide prompts in English for best results.
     * @example "A cute catgirl maid serving tea to her master, anime style, high quality"
     */
    prompt: string;

    /**
     * The desired resolution of the generated image.
     * @enum ["1024x1024", "960x1280", "768x1024", "720x1440", "720x1280"]
     * @example "1024x1024"
     */
    resolution: "1024x1024" | "960x1280" | "768x1024" | "720x1440" | "720x1280";

    /**
     * Optional random seed for reproducible results. If not provided, a random seed will be used.
     * @minimum 0
     * @example 12345
     */
    seed?: number;
}

/**
 * Interface for storing image generation results (can remain similar)
 */
export interface ImageGeneration {
    prompt: string;
    resolution: string;
    response: any; // Store the full API response
    imageUrl?: string; // Store the extracted image URL
    timestamp: string;
}

/**
 * Validates arguments for the generate_image tool using SiliconFlow Flux
 * @param {ImageGenerationArgs} args - The arguments to validate
 * @returns {boolean} - Whether the arguments are valid
 */
export function isValidImageGenerationArgs(args: any): args is ImageGenerationArgs {
    if (!args || typeof args !== 'object') return false;
    if (typeof args.prompt !== 'string' || args.prompt.trim() === '') return false;

    const validResolutions = ["1024x1024", "960x1280", "768x1024", "720x1440", "720x1280"];
    if (typeof args.resolution !== 'string' || !validResolutions.includes(args.resolution)) return false;

    // Validate optional parameters if provided
    if (args.seed !== undefined) {
       const seed = Number(args.seed);
       // SiliconFlow seed might have specific range, but generally non-negative integer is safe
       if (!Number.isInteger(seed) || seed < 0) return false;
    }

    return true;
}
