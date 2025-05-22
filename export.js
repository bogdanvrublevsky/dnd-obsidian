const fs = require('fs');
const path = require('path');

// Парсим аргументы командной строки
const args = process.argv.slice(2);
let targetPath = process.cwd();
let outputFileName = null;

// Обработка аргументов
for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
        console.log(`
Использование: node export-project.js [опции] [путь]

Опции:
  -h, --help           Показать эту справку
  -o, --output FILE    Имя выходного файла
  
Примеры:
  node export-project.js                    # Экспорт всего проекта
  node export-project.js src/               # Экспорт только папки src
  node export-project.js src/app.js         # Экспорт одного файла
  node export-project.js -o my-export.txt   # Задать имя выходного файла
  node export-project.js src/ -o src.txt    # Экспорт папки в конкретный файл
        `);
        process.exit(0);
    } else if (arg === '-o' || arg === '--output') {
        if (i + 1 < args.length) {
            outputFileName = args[i + 1];
            i++; // Пропускаем следующий аргумент
        } else {
            console.error('Ошибка: после -o должно следовать имя файла');
            process.exit(1);
        }
    } else if (!arg.startsWith('-')) {
        // Это путь для экспорта
        targetPath = path.resolve(arg);
    }
}

// Проверяем существование пути
if (!fs.existsSync(targetPath)) {
    console.error(`Ошибка: путь не существует: ${targetPath}`);
    process.exit(1);
}

// Файлы и папки, которые нужно игнорировать
const IGNORE_PATTERNS = [
    'node_modules',
    '.git',
    '.env',
    '.env.local',
    '.env.production',
    'dist',
    'build',
    'coverage',
    '.nyc_output',
    'logs',
    '*.log',
    '.DS_Store',
    'Thumbs.db',
    'export.js',
    'project-export-*.txt',
    'package-lock.json',
    'LICENSE',
    '*.md'
];

// Расширения файлов, которые нужно включить
const INCLUDE_EXTENSIONS = [
    '.js', '.ts', '.jsx', '.tsx', '.json', '.md',
    '.html', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte', '.yaml', '.yml', '.sql',
    '.sh', '.bat', '.dockerfile', '.gitignore'
];

function shouldIgnore(filePath, stats) {
    const basename = path.basename(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    return IGNORE_PATTERNS.some(pattern => {
        if (pattern.includes('*')) {
            // Простая поддержка wildcards
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(basename);
        }
        return relativePath.includes(pattern) || basename === pattern;
    });
}

function shouldIncludeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    // Включаем файлы без расширения, если они в корне (например, Dockerfile)
    if (!ext && path.dirname(filePath) === process.cwd()) {
        return true;
    }

    return INCLUDE_EXTENSIONS.includes(ext);
}

function getFileTree(dir, prefix = '', isRoot = true) {
    const items = fs.readdirSync(dir);
    let result = '';

    items.forEach((item, index) => {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (shouldIgnore(itemPath, stats)) {
            return;
        }

        const isLast = index === items.length - 1;
        const currentPrefix = isLast ? '└── ' : '├── ';
        const nextPrefix = isLast ? '    ' : '│   ';

        if (stats.isDirectory()) {
            result += `${prefix}${currentPrefix}${item}/\n`;
            result += getFileTree(itemPath, prefix + nextPrefix, false);
        } else if (shouldIncludeFile(itemPath)) {
            result += `${prefix}${currentPrefix}${item}\n`;
        }
    });

    return result;
}

function getFileContents(dir, basePath = '') {
    const items = fs.readdirSync(dir);
    let result = '';

    items.forEach(item => {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        const relativePath = path.join(basePath, item);

        if (shouldIgnore(itemPath, stats)) {
            return;
        }

        if (stats.isDirectory()) {
            result += getFileContents(itemPath, relativePath);
        } else if (shouldIncludeFile(itemPath)) {
            try {
                const content = fs.readFileSync(itemPath, 'utf8');
                result += `\n--- ${relativePath} ---\n`;
                result += content;
                result += '\n';
            } catch (error) {
                result += `\n--- ${relativePath} (READ ERROR) ---\n`;
                result += `Error: ${error.message}\n`;
            }
        }
    });

    return result;
}

function exportProject() {
    const stats = fs.statSync(targetPath);
    const isFile = stats.isFile();
    const projectRoot = isFile ? path.dirname(targetPath) : targetPath;

    let output = '';

    // Если экспортируем весь проект, показываем package.json
    if (!isFile && targetPath === process.cwd()) {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                output += `PROJECT INFO:\n`;
                output += `Name: ${packageJson.name || 'N/A'}\n`;
                output += `Version: ${packageJson.version || 'N/A'}\n`;
                if (packageJson.description) output += `Description: ${packageJson.description}\n`;
                output += `\n`;
            } catch (error) {
                output += `package.json read error: ${error.message}\n\n`;
            }
        }
    }

    if (isFile) {
        // Экспорт одного файла
        if (shouldIncludeFile(targetPath)) {
            try {
                const content = fs.readFileSync(targetPath, 'utf8');
                const relativePath = path.relative(process.cwd(), targetPath);
                output += `FILE CONTENT:\n`;
                output += `--- ${relativePath} ---\n`;
                output += content;
            } catch (error) {
                output += `Read error: ${error.message}\n`;
            }
        } else {
            output += `File type not supported for export\n`;
        }
    } else {
        // Экспорт директории
        output += `STRUCTURE:\n`;
        output += getFileTree(targetPath);
        output += `\n`;

        output += `FILES:\n`;
        output += getFileContents(targetPath);
    }

    // Определяем имя выходного файла
    const finalOutputFileName = outputFileName || `project-export-${Date.now()}.txt`;

    fs.writeFileSync(finalOutputFileName, output, 'utf8');

    console.log(`Export complete: ${finalOutputFileName}`);
    console.log(`File size: ${(fs.statSync(finalOutputFileName).size / 1024 / 1024).toFixed(2)} MB`);
}

// Запускаем экспорт
exportProject();