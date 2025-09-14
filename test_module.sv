module alu (
    input  logic [31:0] a,
    input  logic [31:0] b,
    input  logic [3:0]  op,
    output logic [31:0] result,
    output logic        zero
);

    always_comb begin
        case (op)
            4'b0000: result = a + b;    // ADD
            4'b0001: result = a - b;    // SUB
            4'b0010: result = a & b;    // AND
            4'b0011: result = a | b;    // OR
            4'b0100: result = a ^ b;    // XOR
            4'b0101: result = ~a;       // NOT
            default: result = 32'h0;
        endcase
        
        zero = (result == 32'h0);
    end

endmodule

module cpu_core (
    input  logic        clk,
    input  logic        rst_n,
    input  logic [31:0] instruction,
    output logic [31:0] pc,
    output logic [31:0] data_out
);

    logic [31:0] reg_a, reg_b;
    logic [31:0] alu_result;
    logic        alu_zero;
    
    // ALU instantiation
    alu u_alu (
        .a(reg_a),
        .b(reg_b),
        .op(instruction[3:0]),
        .result(alu_result),
        .zero(alu_zero)
    );
    
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            pc <= 32'h0;
            reg_a <= 32'h0;
            reg_b <= 32'h0;
        end else begin
            pc <= pc + 4;
            reg_a <= instruction[31:16];
            reg_b <= instruction[15:0];
        end
    end
    
    assign data_out = alu_result;

endmodule