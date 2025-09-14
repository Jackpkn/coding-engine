// Simple SystemVerilog system for testing connection analysis

module alu (
    input  logic [31:0] a,
    input  logic [31:0] b,
    input  logic [3:0]  op,
    output logic [31:0] result
);
    always_comb begin
        case (op)
            4'b0000: result = a + b;    // ADD
            4'b0001: result = a - b;    // SUB
            4'b0010: result = a & b;    // AND
            4'b0011: result = a | b;    // OR
            default: result = 32'h0;
        endcase
    end
endmodule

module register_file (
    input  logic        clk,
    input  logic        rst_n,
    input  logic [4:0]  read_addr1,
    input  logic [4:0]  read_addr2,
    input  logic [4:0]  write_addr,
    input  logic [31:0] write_data,
    input  logic        write_enable,
    output logic [31:0] read_data1,
    output logic [31:0] read_data2
);
    logic [31:0] registers [0:31];
    
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            for (int i = 0; i < 32; i++) begin
                registers[i] <= 32'h0;
            end
        end else if (write_enable) begin
            registers[write_addr] <= write_data;
        end
    end
    
    assign read_data1 = registers[read_addr1];
    assign read_data2 = registers[read_addr2];
endmodule

module simple_cpu (
    input  logic        clk,
    input  logic        rst_n,
    input  logic [31:0] instruction,
    output logic [31:0] pc,
    output logic [31:0] result
);
    // Internal signals connecting modules
    logic [31:0] alu_a, alu_b, alu_result;
    logic [3:0]  alu_op;
    logic [31:0] reg_data1, reg_data2;
    logic [4:0]  reg_addr1, reg_addr2, reg_write_addr;
    logic [31:0] reg_write_data;
    logic        reg_write_enable;
    
    // Decode instruction
    assign reg_addr1 = instruction[19:15];
    assign reg_addr2 = instruction[14:10];
    assign reg_write_addr = instruction[24:20];
    assign alu_op = instruction[3:0];
    
    // ALU instance - performs arithmetic operations
    alu u_alu (
        .a(alu_a),
        .b(alu_b),
        .op(alu_op),
        .result(alu_result)
    );
    
    // Register file instance - stores data
    register_file u_registers (
        .clk(clk),
        .rst_n(rst_n),
        .read_addr1(reg_addr1),
        .read_addr2(reg_addr2),
        .write_addr(reg_write_addr),
        .write_data(reg_write_data),
        .write_enable(reg_write_enable),
        .read_data1(reg_data1),
        .read_data2(reg_data2)
    );
    
    // Connect ALU inputs to register outputs
    assign alu_a = reg_data1;
    assign alu_b = reg_data2;
    
    // Connect ALU output to register input
    assign reg_write_data = alu_result;
    assign reg_write_enable = 1'b1;
    
    // Output connections
    assign result = alu_result;
    
    // Simple PC increment
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            pc <= 32'h0;
        end else begin
            pc <= pc + 4;
        end
    end
endmodule