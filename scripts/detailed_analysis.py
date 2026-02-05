#!/usr/bin/env python3
"""
Detailed source code analysis - drills into extension and backend modules.
"""

import os
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).parent.parent
EXCLUDE_DIRS = {'node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', 'migrations'}

def count_lines(filepath):
    """Count lines in a file."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        total = len(lines)
        blank = sum(1 for line in lines if line.strip() == '')
        code = total - blank
        return {'total': total, 'code': code, 'blank': blank}
    except:
        return {'total': 0, 'code': 0, 'blank': 0}

def is_test_file(filepath):
    """Determine if a file is a test file."""
    name = filepath.name.lower()
    path_str = str(filepath).lower()
    test_indicators = ['.test.', '.spec.', '_test.', '_spec.', '/test/', '/tests/', '/__tests__/']
    return any(indicator in name or indicator in path_str for indicator in test_indicators)

def analyze_subdirectories(base_path, extensions):
    """Analyze subdirectories within a module."""
    stats = defaultdict(lambda: {'files': 0, 'total': 0, 'code': 0, 'test_files': 0, 'test_lines': 0})

    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        rel_root = Path(root).relative_to(base_path)
        # Get the immediate subdirectory
        parts = rel_root.parts
        subdir = parts[0] if parts else 'root'

        for filename in files:
            filepath = Path(root) / filename
            if filepath.suffix.lower() not in extensions:
                continue

            line_counts = count_lines(filepath)
            is_test = is_test_file(filepath)

            stats[subdir]['files'] += 1
            stats[subdir]['total'] += line_counts['total']
            stats[subdir]['code'] += line_counts['code']

            if is_test:
                stats[subdir]['test_files'] += 1
                stats[subdir]['test_lines'] += line_counts['total']

    return dict(stats)

def analyze_complexity(base_path, extensions):
    """Analyze file complexity - functions/classes per file, average function length."""
    files_data = []

    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for filename in files:
            filepath = Path(root) / filename
            if filepath.suffix.lower() not in extensions:
                continue

            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    lines = content.split('\n')
            except:
                continue

            # Count functions/methods (basic heuristic)
            ext = filepath.suffix.lower()
            if ext in {'.ts', '.tsx', '.js', '.jsx'}:
                # TypeScript/JavaScript
                func_count = (
                    content.count('function ') +
                    content.count('=>') +
                    content.count('async ') // 2  # rough approximation
                )
                class_count = content.count('class ')
            elif ext == '.py':
                # Python
                func_count = content.count('def ')
                class_count = content.count('class ')
            else:
                func_count = 0
                class_count = 0

            files_data.append({
                'path': str(filepath.relative_to(PROJECT_ROOT)),
                'lines': len(lines),
                'functions': func_count,
                'classes': class_count,
                'is_test': is_test_file(filepath),
            })

    return files_data

def print_subdir_report(title, stats):
    """Print subdirectory breakdown."""
    print(f"\n{title}")
    print("-" * 70)
    print(f"  {'Subdirectory':<25} {'Files':>7} {'Total':>8} {'Code':>8} {'Tests':>6} {'TLines':>7}")
    print("  " + "-" * 65)

    sorted_stats = sorted(stats.items(), key=lambda x: x[1]['total'], reverse=True)

    for subdir, data in sorted_stats:
        print(f"  {subdir:<25} {data['files']:>7} {data['total']:>8,} {data['code']:>8,} {data['test_files']:>6} {data['test_lines']:>7,}")

    # Totals
    total_files = sum(d['files'] for d in stats.values())
    total_lines = sum(d['total'] for d in stats.values())
    total_code = sum(d['code'] for d in stats.values())
    total_test_files = sum(d['test_files'] for d in stats.values())
    total_test_lines = sum(d['test_lines'] for d in stats.values())

    print("  " + "-" * 65)
    print(f"  {'TOTAL':<25} {total_files:>7} {total_lines:>8,} {total_code:>8,} {total_test_files:>6} {total_test_lines:>7,}")

def analyze_imports(base_path, extensions):
    """Analyze import patterns to understand dependencies."""
    external_imports = defaultdict(int)
    internal_imports = defaultdict(int)

    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for filename in files:
            filepath = Path(root) / filename
            if filepath.suffix.lower() not in extensions:
                continue

            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
            except:
                continue

            ext = filepath.suffix.lower()
            for line in lines:
                stripped = line.strip()

                if ext in {'.ts', '.tsx', '.js', '.jsx'}:
                    if stripped.startswith('import ') and ' from ' in stripped:
                        # Extract the module name
                        parts = stripped.split(' from ')
                        if len(parts) > 1:
                            module = parts[-1].strip().strip("'\"").strip(';')
                            if module.startswith('.') or module.startswith('@/'):
                                internal_imports[module.split('/')[0]] += 1
                            else:
                                # Get the package name
                                pkg = module.split('/')[0]
                                if pkg.startswith('@'):
                                    pkg = '/'.join(module.split('/')[:2])
                                external_imports[pkg] += 1

                elif ext == '.py':
                    if stripped.startswith('import ') or stripped.startswith('from '):
                        if stripped.startswith('from '):
                            parts = stripped.split()
                            if len(parts) >= 2:
                                module = parts[1].split('.')[0]
                                if module in {'app', 'src', 'tests'}:
                                    internal_imports[module] += 1
                                else:
                                    external_imports[module] += 1
                        else:
                            parts = stripped.replace('import ', '').split(',')
                            for p in parts:
                                module = p.strip().split()[0].split('.')[0]
                                external_imports[module] += 1

    return dict(external_imports), dict(internal_imports)

if __name__ == '__main__':
    print("=" * 70)
    print("            DETAILED SOURCE CODE ANALYSIS")
    print("=" * 70)

    # Extension module breakdown
    extension_path = PROJECT_ROOT / 'extension' / 'src'
    if extension_path.exists():
        ext_stats = analyze_subdirectories(extension_path, {'.ts', '.tsx'})
        print_subdir_report("📦 EXTENSION MODULE BREAKDOWN (extension/src)", ext_stats)

        # Import analysis for extension
        ext_external, ext_internal = analyze_imports(extension_path, {'.ts', '.tsx'})
        print("\n  Top External Dependencies (by import count):")
        for pkg, count in sorted(ext_external.items(), key=lambda x: -x[1])[:10]:
            print(f"    {pkg:<30} {count:>5} imports")

    # Backend module breakdown
    backend_path = PROJECT_ROOT / 'backend' / 'app'
    if backend_path.exists():
        backend_stats = analyze_subdirectories(backend_path, {'.py'})
        print_subdir_report("\n📦 BACKEND MODULE BREAKDOWN (backend/app)", backend_stats)

        # Import analysis for backend
        backend_external, backend_internal = analyze_imports(backend_path, {'.py'})
        print("\n  Top External Dependencies (by import count):")
        for pkg, count in sorted(backend_external.items(), key=lambda x: -x[1])[:10]:
            print(f"    {pkg:<30} {count:>5} imports")

    # Dashboard module breakdown
    dashboard_path = PROJECT_ROOT / 'dashboard' / 'src'
    if dashboard_path.exists():
        dashboard_stats = analyze_subdirectories(dashboard_path, {'.ts', '.tsx'})
        print_subdir_report("\n📦 DASHBOARD MODULE BREAKDOWN (dashboard/src)", dashboard_stats)

    # Complexity Analysis
    print("\n" + "=" * 70)
    print("📊 COMPLEXITY METRICS")
    print("-" * 70)

    all_complexity = []

    for base, exts, label in [
        (PROJECT_ROOT / 'extension' / 'src', {'.ts', '.tsx'}, 'Extension'),
        (PROJECT_ROOT / 'backend' / 'app', {'.py'}, 'Backend'),
        (PROJECT_ROOT / 'dashboard' / 'src', {'.ts', '.tsx'}, 'Dashboard'),
    ]:
        if base.exists():
            complexity = analyze_complexity(base, exts)
            all_complexity.extend(complexity)

            source_files = [f for f in complexity if not f['is_test']]
            test_files = [f for f in complexity if f['is_test']]

            if source_files:
                avg_lines = sum(f['lines'] for f in source_files) / len(source_files)
                avg_funcs = sum(f['functions'] for f in source_files) / len(source_files)
                print(f"\n  {label}:")
                print(f"    Source files:        {len(source_files)}")
                print(f"    Avg lines/file:      {avg_lines:.0f}")
                print(f"    Avg functions/file:  {avg_funcs:.1f}")

            if test_files:
                avg_test_lines = sum(f['lines'] for f in test_files) / len(test_files)
                print(f"    Test files:          {len(test_files)}")
                print(f"    Avg test file size:  {avg_test_lines:.0f} lines")

    # High complexity files
    print("\n  High Complexity Files (>20 functions):")
    high_complexity = [f for f in all_complexity if f['functions'] > 20 and not f['is_test']]
    for f in sorted(high_complexity, key=lambda x: -x['functions'])[:10]:
        print(f"    {f['functions']:>3} funcs  {f['lines']:>5} lines  {f['path']}")

    print("\n" + "=" * 70)

    # Summary stats
    print("\n📈 SUMMARY STATISTICS")
    print("-" * 70)

    # Count by file type in source directories
    ts_files = tsx_files = py_files = 0
    ts_lines = tsx_lines = py_lines = 0

    for f in all_complexity:
        if f['path'].endswith('.ts') and not f['is_test']:
            ts_files += 1
            ts_lines += f['lines']
        elif f['path'].endswith('.tsx') and not f['is_test']:
            tsx_files += 1
            tsx_lines += f['lines']
        elif f['path'].endswith('.py') and not f['is_test']:
            py_files += 1
            py_lines += f['lines']

    print(f"  TypeScript (.ts):     {ts_files:>4} files  {ts_lines:>6,} lines")
    print(f"  React TSX (.tsx):     {tsx_files:>4} files  {tsx_lines:>6,} lines")
    print(f"  Python (.py):         {py_files:>4} files  {py_lines:>6,} lines")
    print(f"  {'='*45}")
    print(f"  Total Source Code:    {ts_files + tsx_files + py_files:>4} files  {ts_lines + tsx_lines + py_lines:>6,} lines")

    print("\n" + "=" * 70)
