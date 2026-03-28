import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initTreeSitter, setCacheDir, setResourceDir } from '../grammar-manager'
import { parseFileAsync } from '../tree-sitter-parser'

// These tests use pre-built grammars from the tree-sitter-wasms package.
// Falls back to CDN download if the package grammars aren't available.

const GRAMMAR_CACHE = path.join(os.tmpdir(), 'pylon-test-grammars')

// Point to the tree-sitter-wasms package for bundled grammars
const WASMS_DIR = path.resolve(__dirname, '../../../../node_modules/tree-sitter-wasms/out')

beforeAll(async () => {
  fs.mkdirSync(GRAMMAR_CACHE, { recursive: true })
  setCacheDir(GRAMMAR_CACHE)
  if (fs.existsSync(WASMS_DIR)) {
    setResourceDir(WASMS_DIR)
  }
  await initTreeSitter()
}, 30_000)

afterAll(() => {
  // Keep the grammar cache for faster re-runs; cleaned up by OS
})

// ── Rust ──

describe('rust', () => {
  const RUST_SOURCE = `
use std::collections::HashMap;
use std::io;

const MAX_SIZE: usize = 100;

fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn distance(&self) -> f64 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}

enum Color {
    Red,
    Green,
    Blue,
}

trait Drawable {
    fn draw(&self);
}
`

  test('extracts function and struct declarations', async () => {
    const result = await parseFileAsync('rust', '/test/main.rs', RUST_SOURCE)

    const names = result.declarations.map((d) => d.name)
    expect(names).toContain('greet')
    expect(names).toContain('Point')

    const fnDecl = result.declarations.find((d) => d.name === 'greet')
    expect(fnDecl).toBeDefined()
    expect(fnDecl?.type).toBe('function')

    const structDecl = result.declarations.find((d) => d.name === 'Point' && d.type === 'class')
    expect(structDecl).toBeDefined()
  }, 30_000)

  test('extracts enum and trait declarations', async () => {
    const result = await parseFileAsync('rust', '/test/main.rs', RUST_SOURCE)

    const names = result.declarations.map((d) => d.name)
    expect(names).toContain('Color')
    expect(names).toContain('Drawable')

    const colorDecl = result.declarations.find((d) => d.name === 'Color')
    expect(colorDecl?.type).toBe('type')
  }, 30_000)

  test('extracts use statements as imports', async () => {
    const result = await parseFileAsync('rust', '/test/main.rs', RUST_SOURCE)

    expect(result.imports.length).toBeGreaterThanOrEqual(2)
    const specs = result.imports.map((i) => i.moduleSpecifier)
    expect(specs.some((s) => s.includes('HashMap'))).toBe(true)
    expect(specs.some((s) => s.includes('io'))).toBe(true)
  }, 30_000)

  test('extracts const declarations', async () => {
    const result = await parseFileAsync('rust', '/test/main.rs', RUST_SOURCE)

    const constDecl = result.declarations.find((d) => d.name === 'MAX_SIZE')
    expect(constDecl).toBeDefined()
    expect(constDecl?.type).toBe('variable')
  }, 30_000)
})

// ── Python ──

describe('python', () => {
  const PYTHON_SOURCE = `
import os
from pathlib import Path

def greet(name: str) -> str:
    return f"Hello, {name}!"

class Animal:
    def __init__(self, species: str):
        self.species = species

    def speak(self) -> str:
        return "..."

def compute(x, y):
    if x > y:
        return x - y
    return x + y
`

  test('extracts function and class declarations', async () => {
    const result = await parseFileAsync('python', '/test/main.py', PYTHON_SOURCE)

    const names = result.declarations.map((d) => d.name)
    expect(names).toContain('greet')
    expect(names).toContain('Animal')
    expect(names).toContain('compute')

    const fnDecl = result.declarations.find((d) => d.name === 'greet')
    expect(fnDecl?.type).toBe('function')

    const classDecl = result.declarations.find((d) => d.name === 'Animal')
    expect(classDecl?.type).toBe('class')
  }, 30_000)

  test('extracts import statements', async () => {
    const result = await parseFileAsync('python', '/test/main.py', PYTHON_SOURCE)

    expect(result.imports.length).toBeGreaterThanOrEqual(2)
    const specs = result.imports.map((i) => i.moduleSpecifier)
    expect(specs).toContain('os')
    expect(specs).toContain('pathlib')
  }, 30_000)
})

// ── Go ──

describe('go', () => {
  const GO_SOURCE = `
package main

import (
    "fmt"
    "os"
)

type Point struct {
    X float64
    Y float64
}

func greet(name string) string {
    return fmt.Sprintf("Hello, %s!", name)
}

func main() {
    fmt.Println(greet("world"))
}
`

  test('extracts function and type declarations', async () => {
    const result = await parseFileAsync('go', '/test/main.go', GO_SOURCE)

    const names = result.declarations.map((d) => d.name)
    expect(names).toContain('greet')
    expect(names).toContain('main')

    const fnDecl = result.declarations.find((d) => d.name === 'greet')
    expect(fnDecl?.type).toBe('function')

    // Point is a type declaration in Go
    const typeDecl = result.declarations.find((d) => d.name === 'Point')
    expect(typeDecl).toBeDefined()
    expect(typeDecl?.type).toBe('type')
  }, 30_000)

  test('extracts import statements', async () => {
    const result = await parseFileAsync('go', '/test/main.go', GO_SOURCE)

    expect(result.imports.length).toBeGreaterThanOrEqual(2)
    const specs = result.imports.map((i) => i.moduleSpecifier)
    expect(specs).toContain('fmt')
    expect(specs).toContain('os')
  }, 30_000)
})

// ── Unknown language ──

describe('unknown language', () => {
  test('returns empty result for unsupported language', async () => {
    const result = await parseFileAsync('brainfuck', '/test/main.bf', '++++++++')
    expect(result.declarations).toEqual([])
    expect(result.imports).toEqual([])
  })
})
