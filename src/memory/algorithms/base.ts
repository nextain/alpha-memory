export interface MemoryAlgorithm {
	process(data: any): Promise<any>;
	retrieve(query: string, options?: any): Promise<any[]>;
	// Add other common methods as needed for memory algorithms
}
