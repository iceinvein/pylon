/**
 * Tree-sitter S-expression queries for extracting declarations, imports,
 * and control flow from various languages.
 *
 * These queries use tree-sitter's query syntax and match against the concrete
 * syntax tree (CST) node types defined by each language's grammar. Queries
 * are intentionally conservative — it is better to miss some nodes than to
 * crash on a grammar version mismatch.
 */

export type LanguageQueries = {
  declarations: string
  imports: string
  controlFlow: string
}

export const QUERIES: Record<string, LanguageQueries> = {
  rust: {
    declarations: `
      (function_item name: (identifier) @name) @function
      (struct_item name: (type_identifier) @name) @class
      (impl_item type: (type_identifier) @name) @class
      (enum_item name: (type_identifier) @name) @type
      (trait_item name: (type_identifier) @name) @type
      (const_item name: (identifier) @name) @variable
      (static_item name: (identifier) @name) @variable
    `,
    imports: `(use_declaration argument: (_) @path) @import`,
    controlFlow: `
      (if_expression) @statement
      (for_expression) @statement
      (while_expression) @statement
      (loop_expression) @statement
      (match_expression) @statement
      (return_expression) @statement
      (call_expression function: (_) @name) @expression
    `,
  },

  python: {
    declarations: `
      (function_definition name: (identifier) @name) @function
      (class_definition name: (identifier) @name) @class
      (decorated_definition definition: (function_definition name: (identifier) @name)) @function
      (decorated_definition definition: (class_definition name: (identifier) @name)) @class
    `,
    imports: `
      (import_statement name: (dotted_name) @path) @import
      (import_from_statement module_name: (dotted_name) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (return_statement) @statement
      (call) @expression
    `,
  },

  go: {
    declarations: `
      (function_declaration name: (identifier) @name) @function
      (method_declaration name: (field_identifier) @name) @function
      (type_declaration (type_spec name: (type_identifier) @name)) @type
      (var_declaration (var_spec name: (identifier) @name)) @variable
      (const_declaration (const_spec name: (identifier) @name)) @variable
    `,
    imports: `
      (import_spec path: (interpreted_string_literal) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (return_statement) @statement
      (select_statement) @statement
      (call_expression function: (_) @name) @expression
    `,
  },

  c: {
    declarations: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function
      (struct_specifier name: (type_identifier) @name) @class
      (enum_specifier name: (type_identifier) @name) @type
      (declaration declarator: (init_declarator declarator: (identifier) @name)) @variable
    `,
    imports: `
      (preproc_include path: (_) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (do_statement) @statement
      (switch_statement) @statement
      (return_statement) @statement
      (call_expression function: (identifier) @name) @expression
    `,
  },

  cpp: {
    declarations: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function
      (function_definition declarator: (function_declarator declarator: (qualified_identifier name: (identifier) @name))) @function
      (class_specifier name: (type_identifier) @name) @class
      (struct_specifier name: (type_identifier) @name) @class
      (enum_specifier name: (type_identifier) @name) @type
      (declaration declarator: (init_declarator declarator: (identifier) @name)) @variable
      (namespace_definition name: (identifier) @name) @type
    `,
    imports: `
      (preproc_include path: (_) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (for_range_loop) @statement
      (while_statement) @statement
      (do_statement) @statement
      (switch_statement) @statement
      (return_statement) @statement
      (call_expression function: (_) @name) @expression
    `,
  },

  java: {
    declarations: `
      (method_declaration name: (identifier) @name) @function
      (constructor_declaration name: (identifier) @name) @function
      (class_declaration name: (identifier) @name) @class
      (interface_declaration name: (identifier) @name) @type
      (enum_declaration name: (identifier) @name) @type
      (field_declaration declarator: (variable_declarator name: (identifier) @name)) @variable
    `,
    imports: `
      (import_declaration (scoped_identifier) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (enhanced_for_statement) @statement
      (while_statement) @statement
      (do_statement) @statement
      (switch_expression) @statement
      (return_statement) @statement
      (method_invocation name: (identifier) @name) @expression
    `,
  },

  ruby: {
    declarations: `
      (method name: (identifier) @name) @function
      (singleton_method name: (identifier) @name) @function
      (class name: (constant) @name) @class
      (module name: (constant) @name) @type
      (assignment left: (identifier) @name) @variable
    `,
    imports: `
      (call method: (identifier) @method arguments: (argument_list (string (string_content) @path)) (#eq? @method "require")) @import
      (call method: (identifier) @method arguments: (argument_list (string (string_content) @path)) (#eq? @method "require_relative")) @import
    `,
    controlFlow: `
      (if) @statement
      (unless) @statement
      (while) @statement
      (until) @statement
      (for) @statement
      (case) @statement
      (return) @statement
      (call method: (identifier) @name) @expression
    `,
  },
}
