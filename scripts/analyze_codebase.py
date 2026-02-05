#!/usr/bin/env python3
"""
Codebase Analysis Script
Analyzes lines of code, file distribution, and other metrics.
"""

import os
import sys
from pathlib import Path
from collections import defaultdict
import json

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
EXCLUDE_DIRS = {
    'node_modules', '.git', 'dist', 'build', '__pycache__',
    '.venv', 'venv', 'env', '.pytest_cache', '.mypy_cache',
    'htmlcov', 'coverage', '.next', '.nuxt', 'migrations'
}
EXCLUDE_FILES = {'.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'}

# File extension to language mapping
LANGUAGE_MAP = {
    '.py': 'Python',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.toml': 'TOML',
    '.env': 'Environment',
    '.gitignore': 'Config',
    '.svg': 'SVG',
    '.mjs': 'JavaScript (ES Module)',
}

def is_binary_file(filepath):
    """Check if a file is binary."""
    try:
        with open(filepath, 'rb') as f:
            chunk = f.read(1024)
            return b'\0' in chunk
    except:
        return True

def count_lines(filepath):
    """Count lines in a file: total, code, comments, blank."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except:
        return {'total': 0, 'code': 0, 'blank': 0, 'comment': 0}

    total = len(lines)
    blank = sum(1 for line in lines if line.strip() == '')

    # Simple comment detection (language-agnostic approximation)
    ext = filepath.suffix.lower()
    comment_chars = {
        '.py': '#',
        '.ts': '//',
        '.tsx': '//',
        '.js': '//',
        '.jsx': '//',
        '.sh': '#',
        '.yaml': '#',
        '.yml': '#',
        '.toml': '#',
    }

    comment_char = comment_chars.get(ext, '//')
    comment = 0
    in_multiline = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Multi-line comment detection (basic)
        if '/*' in stripped and '*/' not in stripped:
            in_multiline = True
            comment += 1
        elif '*/' in stripped:
            in_multiline = False
            comment += 1
        elif in_multiline:
            comment += 1
        elif stripped.startswith(comment_char) or stripped.startswith('"""') or stripped.startswith("'''"):
            comment += 1

    code = total - blank - comment

    return {'total': total, 'code': max(0, code), 'blank': blank, 'comment': comment}

def get_language(filepath):
    """Determine the language of a file."""
    ext = filepath.suffix.lower()
    name = filepath.name.lower()

    # Special file names
    if name in {'.gitignore', '.dockerignore', '.eslintignore'}:
        return 'Config'
    if name in {'dockerfile', 'makefile'}:
        return name.capitalize()
    if name.endswith('.config.js') or name.endswith('.config.ts'):
        return 'Config'

    return LANGUAGE_MAP.get(ext, f'Other ({ext})' if ext else 'Other')

def is_test_file(filepath):
    """Determine if a file is a test file."""
    name = filepath.name.lower()
    path_str = str(filepath).lower()

    test_indicators = [
        '.test.', '.spec.', '_test.', '_spec.',
        '/test/', '/tests/', '/__tests__/',
        '/testing/', '/fixtures/'
    ]

    return any(indicator in name or indicator in path_str for indicator in test_indicators)

def analyze_directory(root_path):
    """Analyze all files in a directory."""
    stats = {
        'total_files': 0,
        'total_lines': 0,
        'code_lines': 0,
        'blank_lines': 0,
        'comment_lines': 0,
        'by_language': defaultdict(lambda: {'files': 0, 'total': 0, 'code': 0, 'blank': 0, 'comment': 0}),
        'by_module': defaultdict(lambda: {'files': 0, 'total': 0, 'code': 0, 'ts_files': 0, 'py_files': 0}),
        'test_stats': {'files': 0, 'lines': 0},
        'source_stats': {'files': 0, 'lines': 0},
        'largest_files': [],
        'file_list': [],
    }

    for root, dirs, files in os.walk(root_path):
        # Filter excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        rel_root = Path(root).relative_to(root_path)

        # Determine module (top-level directory)
        parts = rel_root.parts
        module = parts[0] if parts else 'root'

        for filename in files:
            if filename in EXCLUDE_FILES:
                continue

            filepath = Path(root) / filename

            if is_binary_file(filepath):
                continue

            language = get_language(filepath)
            line_counts = count_lines(filepath)
            is_test = is_test_file(filepath)

            # Update totals
            stats['total_files'] += 1
            stats['total_lines'] += line_counts['total']
            stats['code_lines'] += line_counts['code']
            stats['blank_lines'] += line_counts['blank']
            stats['comment_lines'] += line_counts['comment']

            # By language
            lang_stats = stats['by_language'][language]
            lang_stats['files'] += 1
            lang_stats['total'] += line_counts['total']
            lang_stats['code'] += line_counts['code']
            lang_stats['blank'] += line_counts['blank']
            lang_stats['comment'] += line_counts['comment']

            # By module
            mod_stats = stats['by_module'][module]
            mod_stats['files'] += 1
            mod_stats['total'] += line_counts['total']
            mod_stats['code'] += line_counts['code']
            if filepath.suffix in {'.ts', '.tsx'}:
                mod_stats['ts_files'] += 1
            elif filepath.suffix == '.py':
                mod_stats['py_files'] += 1

            # Test vs source
            if is_test:
                stats['test_stats']['files'] += 1
                stats['test_stats']['lines'] += line_counts['total']
            else:
                stats['source_stats']['files'] += 1
                stats['source_stats']['lines'] += line_counts['total']

            # Track for largest files
            rel_path = str(filepath.relative_to(root_path))
            stats['file_list'].append({
                'path': rel_path,
                'language': language,
                'lines': line_counts['total'],
                'code': line_counts['code'],
                'is_test': is_test,
                'module': module,
            })

    # Sort largest files
    stats['largest_files'] = sorted(
        stats['file_list'],
        key=lambda x: x['lines'],
        reverse=True
    )[:20]

    return stats

def print_report(stats):
    """Print a formatted report."""
    print("=" * 70)
    print("                    CODEBASE ANALYSIS REPORT")
    print("=" * 70)
    print()

    # Overview
    print("📊 OVERVIEW")
    print("-" * 50)
    print(f"  Total Files:        {stats['total_files']:,}")
    print(f"  Total Lines:        {stats['total_lines']:,}")
    print(f"  Code Lines:         {stats['code_lines']:,}")
    print(f"  Blank Lines:        {stats['blank_lines']:,}")
    print(f"  Comment Lines:      {stats['comment_lines']:,}")
    if stats['total_lines'] > 0:
        code_pct = (stats['code_lines'] / stats['total_lines']) * 100
        print(f"  Code Density:       {code_pct:.1f}%")
    print()

    # Test vs Source
    print("🧪 TEST vs SOURCE CODE")
    print("-" * 50)
    src = stats['source_stats']
    test = stats['test_stats']
    print(f"  Source Files:       {src['files']:,} ({src['lines']:,} lines)")
    print(f"  Test Files:         {test['files']:,} ({test['lines']:,} lines)")
    if src['lines'] > 0:
        test_ratio = (test['lines'] / src['lines']) * 100
        print(f"  Test/Source Ratio:  {test_ratio:.1f}%")
    print()

    # By Language
    print("📝 LINES OF CODE BY LANGUAGE")
    print("-" * 50)
    print(f"  {'Language':<25} {'Files':>8} {'Total':>10} {'Code':>10}")
    print("  " + "-" * 55)

    sorted_langs = sorted(
        stats['by_language'].items(),
        key=lambda x: x[1]['total'],
        reverse=True
    )

    for lang, data in sorted_langs:
        print(f"  {lang:<25} {data['files']:>8} {data['total']:>10,} {data['code']:>10,}")
    print()

    # By Module
    print("📁 LINES OF CODE BY MODULE")
    print("-" * 50)
    print(f"  {'Module':<20} {'Files':>8} {'Total':>10} {'Code':>10} {'TS':>6} {'PY':>6}")
    print("  " + "-" * 65)

    sorted_modules = sorted(
        stats['by_module'].items(),
        key=lambda x: x[1]['total'],
        reverse=True
    )

    for module, data in sorted_modules:
        print(f"  {module:<20} {data['files']:>8} {data['total']:>10,} {data['code']:>10,} {data['ts_files']:>6} {data['py_files']:>6}")
    print()

    # Largest Files
    print("📄 LARGEST FILES (Top 20)")
    print("-" * 50)
    print(f"  {'Lines':>7} {'Code':>7}  {'Path'}")
    print("  " + "-" * 65)

    for f in stats['largest_files']:
        test_marker = " [TEST]" if f['is_test'] else ""
        print(f"  {f['lines']:>7} {f['code']:>7}  {f['path']}{test_marker}")
    print()

    # Additional Insights
    print("💡 ADDITIONAL INSIGHTS")
    print("-" * 50)

    # Average file size
    if stats['total_files'] > 0:
        avg_lines = stats['total_lines'] / stats['total_files']
        print(f"  Average File Size:  {avg_lines:.0f} lines")

    # Files over 500 lines
    large_files = [f for f in stats['file_list'] if f['lines'] > 500]
    print(f"  Files > 500 lines:  {len(large_files)}")

    # TypeScript/Python breakdown
    ts_total = sum(d['code'] for l, d in stats['by_language'].items() if 'TypeScript' in l)
    py_total = stats['by_language']['Python']['code']
    print(f"  TypeScript Code:    {ts_total:,} lines")
    print(f"  Python Code:        {py_total:,} lines")

    # Config files
    config_langs = ['JSON', 'YAML', 'TOML', 'Config', 'Environment']
    config_total = sum(stats['by_language'][l]['total'] for l in config_langs if l in stats['by_language'])
    print(f"  Config Files:       {config_total:,} lines")

    # Documentation
    doc_total = stats['by_language'].get('Markdown', {}).get('total', 0)
    print(f"  Documentation:      {doc_total:,} lines")

    print()
    print("=" * 70)

def export_json(stats, output_path):
    """Export stats to JSON for further analysis."""
    # Convert defaultdicts to regular dicts
    export_data = {
        'overview': {
            'total_files': stats['total_files'],
            'total_lines': stats['total_lines'],
            'code_lines': stats['code_lines'],
            'blank_lines': stats['blank_lines'],
            'comment_lines': stats['comment_lines'],
        },
        'test_vs_source': {
            'source': stats['source_stats'],
            'test': stats['test_stats'],
        },
        'by_language': dict(stats['by_language']),
        'by_module': dict(stats['by_module']),
        'largest_files': stats['largest_files'],
    }

    with open(output_path, 'w') as f:
        json.dump(export_data, f, indent=2)
    print(f"JSON export saved to: {output_path}")

if __name__ == '__main__':
    print(f"Analyzing codebase at: {PROJECT_ROOT}")
    print()

    stats = analyze_directory(PROJECT_ROOT)
    print_report(stats)

    # Optional JSON export
    json_path = PROJECT_ROOT / 'scripts' / 'codebase_analysis.json'
    export_json(stats, json_path)
