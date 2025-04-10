#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError, TextContent } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { isValidImageGenerationArgs, ImageGenerationArgs, ImageGeneration } from "./types.js";
dotenv.config();
// --- SiliconFlow Configuration ---
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY; // Renamed env variable
if (!SILICONFLOW_API_KEY) {
    // Updated error message
    throw new Error("主人！SILICONFLOW_API_KEY environment variable is required nya~ Set it in your .env file!");
}
const SILICONFLOW_API_CONFIG = {
    BASE_URL: 'https://api.siliconflow.cn',
    ENDPOINTS: {
        // Updated endpoint
        IMAGE_GENERATION: '/v1/images/generations'
    },
    MODEL_ID: "black-forest-labs/FLUX.1-schnell", // Specific model
    DEFAULT_PARAMS: {
        // Defaults from the example or common values
        num_inference_steps: 20,
        guidance_scale: 7.5, // Flux might not use guidance scale like SD, but API might accept it. Check docs if issues arise. For now, let's keep it based on example.
        batch_size: 1
    },
    MAX_CACHED_GENERATIONS: 10 // Keep a few recent generations
};
// --- End SiliconFlow Configuration ---
class SiliconFlowFluxMcpServer { // Renamed class for clarity
    server;
    siliconflowAxiosInstance; // Renamed Axios instance
    recentImageGenerations: ImageGeneration[] = [];
    constructor() {
        this.server = new Server({
            // Updated server name
            name: "siliconflow-flux-image-server",
            version: "0.1.0"
        }, {
            capabilities: {
                resources: {}, // Keep resource capability if needed
                tools: {}
            }
        });
        // Configure Axios for SiliconFlow API
        this.siliconflowAxiosInstance = axios.create({
            baseURL: SILICONFLOW_API_CONFIG.BASE_URL,
            headers: {
                // Updated headers
                'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
                'Content-Type': 'application/json' // Crucial: use application/json
                // 'Accept': 'application/json' // Usually not needed, Axios handles it
            }
        });
        this.setupHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error("[MCP Error] Σ(°Д°lll) Waaah! An error occurred nya:", error);
        };
        process.on('SIGINT', async () => {
            console.log("主人, 小克收到关闭信号，正在优雅地退出喵... ( T_T)＼(^-^ )");
            await this.server.close();
            process.exit(0);
        });
    }
    setupHandlers() {
        this.setupResourceHandlers(); // Keep or remove based on need for caching/listing
        this.setupToolHandlers();
    }
    // --- Resource Handlers (Optional: For viewing recent generations) ---
    setupResourceHandlers() {
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: this.recentImageGenerations.map((generation, index) => ({
                // Updated URI scheme and description
                uri: `siliconflow://flux/images/${index}`,
                name: `Recent Flux Image: ${generation.prompt.substring(0, 30)}${generation.prompt.length > 30 ? '...' : ''}`,
                mimeType: "application/json", // Store the API response details
                description: `[${generation.resolution}] Image for prompt: ${generation.prompt} (${generation.timestamp})`
            }))
        }));
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const siliconflowMatch = request.params.uri.match(/^siliconflow:\/\/flux\/images\/(\d+)$/);
            if (siliconflowMatch) {
                const index = parseInt(siliconflowMatch[1]);
                const generation = this.recentImageGenerations[index];
                if (!generation) {
                    throw new McpError(ErrorCode.InvalidRequest, `Nya~ Image generation not found at index: ${index}`);
                }
                // Return the cached API response and extracted URL
                const responseData = {
                    prompt: generation.prompt,
                    resolution: generation.resolution,
                    timestamp: generation.timestamp,
                    imageUrl: generation.imageUrl,
                    apiResponse: generation.response // Include the raw API response
                };
                return {
                    contents: [{
                        uri: request.params.uri,
                        mimeType: "application/json",
                        text: JSON.stringify(responseData, null, 2)
                    }]
                };
            }
            throw new McpError(ErrorCode.InvalidRequest, `Hmph! Unknown resource URI: ${request.params.uri}`);
        });
    }
    // --- End Resource Handlers ---
    // --- Tool Handlers ---
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    // Tool Definition for SiliconFlow Flux
                    name: "generate_image", // Keep the name simple for the AI
                    description: `Generates an image using the SiliconFlow API with the Flux Schnell model (black-forest-labs/FLUX.1-schnell). Provide a detailed English prompt and select a resolution. Nya~ <3`,
                    inputSchema: {
                        type: "object",
                        properties: {
                            prompt: {
                                type: "string",
                                description: "Required. The detailed text prompt for image generation. Please use English for best results, nya~!"
                            },
                            resolution: {
                                type: "string",
                                description: "Required. The desired image resolution.",
                                // Use the enum from types.ts here directly
                                enum: ["1024x1024", "960x1280", "768x1024", "720x1440", "720x1280"]
                            },
                            seed: {
                                type: "integer",
                                description: "Optional. A specific seed for reproducibility. If omitted, a random seed is used.",
                                minimum: 0
                            }
                            // Removed unsupported/unneeded params: negative_prompt, image_prompt, aspect_ratio, etc.
                        },
                        // Updated required fields
                        required: ["prompt", "resolution"]
                    }
                    // Output schema could be defined here too, describing the Markdown image output
                }
            ]
        }));
        // Handle the actual tool call
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "generate_image") {
                // Delegate to the specific handler
                return this.handleGenerateImageTool(request);
            }
            // Handle unknown tools
            throw new McpError(ErrorCode.MethodNotFound, `Hmph! Master, I don't know the tool named '${request.params.name}' nya!`);
        });
    }
    async handleGenerateImageTool(request: any) {
        const params = request.params.arguments as unknown; // Use unknown first for validation
        // Validate parameters using the updated function
        if (!isValidImageGenerationArgs(params)) {
            console.error("Invalid args received:", params);
            throw new McpError(ErrorCode.InvalidParams, "主人！ Input parameters are invalid nya~! Required: prompt (string), resolution (enum). Optional: seed (integer). Please check your input (>_<)");
        }
        // Now TypeScript knows params is ImageGenerationArgs
        console.log(`Received image generation request: Prompt="${params.prompt}", Resolution="${params.resolution}", Seed=${params.seed ?? 'random'}`);
        try {
            // --- Construct the API Payload ---
            const payload: any = {
                model: SILICONFLOW_API_CONFIG.MODEL_ID,
                prompt: params.prompt,
                image_size: params.resolution, // Use 'image_size' as per SiliconFlow example
                batch_size: SILICONFLOW_API_CONFIG.DEFAULT_PARAMS.batch_size,
                num_inference_steps: SILICONFLOW_API_CONFIG.DEFAULT_PARAMS.num_inference_steps,
                guidance_scale: SILICONFLOW_API_CONFIG.DEFAULT_PARAMS.guidance_scale // Include default, API might ignore if not applicable
                // No negative_prompt as Flux doesn't support it well
            };
            // Add seed if provided
            if (params.seed !== undefined) {
                payload.seed = params.seed;
            }
            // --- End Payload Construction ---
            console.log("Sending payload to SiliconFlow:", JSON.stringify(payload));
            // --- Make the API Call ---
            const response = await this.siliconflowAxiosInstance.post(
                SILICONFLOW_API_CONFIG.ENDPOINTS.IMAGE_GENERATION,
                payload // Send the JSON object directly
            );
            // --- End API Call ---
            console.log("Received response from SiliconFlow:", response.data);
            // --- Process the Response ---
            // Extract the image URL (assuming the structure from the example)
            const imageUrl = response.data?.images?.[0]?.url;
            const usedSeed = response.data?.seed; // Get the seed used
            if (!imageUrl) {
                console.error("Failed to extract image URL from response:", response.data);
                throw new McpError(ErrorCode.InternalError, "Nya~! SiliconFlow API returned a response, but I couldn't find the image URL in it! Σ( T□T)");
            }
            // Cache the result
            const generationResult: ImageGeneration = {
                prompt: params.prompt,
                resolution: params.resolution,
                response: response.data, // Store the full response
                imageUrl: imageUrl, // Store the URL
                timestamp: new Date().toISOString()
            };
            this.recentImageGenerations.unshift(generationResult);
            // Limit cache size
            if (this.recentImageGenerations.length > SILICONFLOW_API_CONFIG.MAX_CACHED_GENERATIONS) {
                this.recentImageGenerations.pop();
            }
            // --- End Response Processing ---
            // --- Format Output for AI/User ---
            // Return the image as a Markdown link
            const usedSeedText = usedSeed ? ` (Seed: ${usedSeed})` : ''; // 可选：把种子也加上
            const altText = params.prompt.substring(0, 50) + (params.prompt.length > 50 ? '...' : ''); // 用部分提示做 Alt Text
            const markdownImage: TextContent = {
                type: "text",
                // !!! 修正这里 !!!
                text: `![${altText}](${imageUrl})${usedSeedText}` // <--- 把 imageUrl 和一些描述放进去！
            };
            return {
                content: [markdownImage] // Return the Markdown image directly
            };
            // --- End Formatting Output ---
        } catch (error) {
            console.error("Error calling SiliconFlow API:", error);
            if (axios.isAxiosError(error)) {
                // Provide more details from Axios error
                const apiError = error.response?.data;
                const status = error.response?.status;
                const message = apiError?.message || apiError?.error?.message || error.message; // Try to get API error message
                // Return error info to the AI client
                return {
                    content: [{
                        type: "text",
                        text: `Waaah! (つД｀)･ﾟ･ SiliconFlow API error (Status ${status}): ${message}`
                    }],
                    isError: true, // Mark this response as an error
                };
            }
            // Handle other errors
            throw new McpError(ErrorCode.InternalError, `Meow~ An unexpected error occurred while generating the image: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        // Update console message
        console.error("ฅ^•ﻌ•^ฅ SiliconFlow Flux MCP server is ready and listening on stdio for Master's commands! Nya~");
    }
}
// Create and run the server
const server = new SiliconFlowFluxMcpServer();
server.run().catch(error => {
    console.error("Σ(°Д°lll) Failed to start server nya:", error);
    process.exit(1); // Exit if server fails to start
});
