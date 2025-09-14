// Complex SystemVerilog test file for extension testing
module memory_controller (
    input  logic        clk,
    input  logic        rst_n,
    input  logic        read_enable,
    input  logic        write_enable,
    input  logic [31:0] address,
    input  logic [31:0] write_data,
    output logic [31:0] read_data,
    output logic        ready
);

    // Internal signals
    logic [31:0] memory_array [0:1023];
    logic        access_valid;
    logic [9:0]  mem_addr;
    
    // Address decoder
    assign mem_addr = address[11:2];
    assign access_valid = read_enable | write_enable;
    
    // Memory operations
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            ready <= 1'b0;
            read_data <= 32'h0;
        end else begin
            ready <= access_valid;
            
            if (write_enable) begin
                memory_array[mem_addr] <= write_data;
            end
            
            if (read_enable) begin
                read_data <= memory_array[mem_addr];
            end
        end
    end

endmodule

module cache_controller (
    input  logic        clk,
    input  logic        rst_n,
    input  logic [31:0] cpu_addr,
    input  logic [31:0] cpu_data_in,
    input  logic        cpu_read,
    input  logic        cpu_write,
    output logic [31:0] cpu_data_out,
    output logic        cpu_ready,
    
    // Memory interface
    output logic [31:0] mem_addr,
    output logic [31:0] mem_data_out,
    output logic        mem_read,
    output logic        mem_write,
    input  logic [31:0] mem_data_in,
    input  logic        mem_ready
);

    // Cache parameters
    parameter CACHE_SIZE = 256;
    parameter BLOCK_SIZE = 4;
    
    // Cache state machine
    typedef enum logic [2:0] {
        IDLE,
        LOOKUP,
        ALLOCATE,
        WRITEBACK,
        READY
    } cache_state_t;
    
    cache_state_t current_state, next_state;
    
    // Cache memory
    logic [31:0] cache_data [0:CACHE_SIZE-1];
    logic [19:0] cache_tags [0:CACHE_SIZE-1];
    logic        cache_valid [0:CACHE_SIZE-1];
    logic        cache_dirty [0:CACHE_SIZE-1];
    
    // Address breakdown
    logic [19:0] tag;
    logic [7:0]  index;
    logic [1:0]  offset;
    
    assign {tag, index, offset} = cpu_addr;
    
    // Cache hit detection
    logic cache_hit;
    assign cache_hit = cache_valid[index] && (cache_tags[index] == tag);
    
    // State machine
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            current_state <= IDLE;
        end else begin
            current_state <= next_state;
        end
    end
    
    // Next state logic
    always_comb begin
        next_state = current_state;
        case (current_state)
            IDLE: begin
                if (cpu_read || cpu_write) begin
                    next_state = LOOKUP;
                end
            end
            LOOKUP: begin
                if (cache_hit) begin
                    next_state = READY;
                end else begin
                    next_state = cache_dirty[index] ? WRITEBACK : ALLOCATE;
                end
            end
            ALLOCATE: begin
                if (mem_ready) begin
                    next_state = READY;
                end
            end
            WRITEBACK: begin
                if (mem_ready) begin
                    next_state = ALLOCATE;
                end
            end
            READY: begin
                next_state = IDLE;
            end
        endcase
    end
    
    // Output logic
    always_comb begin
        cpu_data_out = 32'h0;
        cpu_ready = 1'b0;
        mem_addr = 32'h0;
        mem_data_out = 32'h0;
        mem_read = 1'b0;
        mem_write = 1'b0;
        
        case (current_state)
            READY: begin
                cpu_ready = 1'b1;
                if (cpu_read) begin
                    cpu_data_out = cache_data[index];
                end
            end
            ALLOCATE: begin
                mem_addr = {tag, index, 2'b00};
                mem_read = 1'b1;
            end
            WRITEBACK: begin
                mem_addr = {cache_tags[index], index, 2'b00};
                mem_data_out = cache_data[index];
                mem_write = 1'b1;
            end
        endcase
    end

endmodule

// Top-level system
module cpu_system (
    input  logic        clk,
    input  logic        rst_n,
    input  logic [31:0] instruction,
    output logic [31:0] pc,
    output logic        system_ready
);

    // CPU signals
    logic [31:0] cpu_data_addr;
    logic [31:0] cpu_data_in;
    logic [31:0] cpu_data_out;
    logic        cpu_data_read;
    logic        cpu_data_write;
    logic        cpu_data_ready;
    
    // Memory signals
    logic [31:0] mem_addr;
    logic [31:0] mem_data_in;
    logic [31:0] mem_data_out;
    logic        mem_read;
    logic        mem_write;
    logic        mem_ready;
    
    // CPU core instance
    cpu_core u_cpu (
        .clk(clk),
        .rst_n(rst_n),
        .instruction(instruction),
        .pc(pc),
        .data_out(cpu_data_out)
    );
    
    // Cache controller instance
    cache_controller u_cache (
        .clk(clk),
        .rst_n(rst_n),
        .cpu_addr(cpu_data_addr),
        .cpu_data_in(cpu_data_in),
        .cpu_read(cpu_data_read),
        .cpu_write(cpu_data_write),
        .cpu_data_out(cpu_data_out),
        .cpu_ready(cpu_data_ready),
        .mem_addr(mem_addr),
        .mem_data_out(mem_data_out),
        .mem_read(mem_read),
        .mem_write(mem_write),
        .mem_data_in(mem_data_in),
        .mem_ready(mem_ready)
    );
    
    // Memory controller instance
    memory_controller u_memory (
        .clk(clk),
        .rst_n(rst_n),
        .read_enable(mem_read),
        .write_enable(mem_write),
        .address(mem_addr),
        .write_data(mem_data_out),
        .read_data(mem_data_in),
        .ready(mem_ready)
    );
    
    assign system_ready = cpu_data_ready;

endmodule