#! /usr/bin/env node

import { cwd, argv, exit } from 'node:process';
import { readdir, stat } from 'node:fs/promises';

const args = argv.slice(2);

try {
  const { options = {}, patterns = [], errors: parseArgsErrors = {} } = parseArgs(args) ?? {};
  const filesInCwd = await readdir(cwd());

  let filterFiles = filesInCwd;
  let collectedErrors = parseArgsErrors;
  const hasFilterListFlowResult = hasFilterListFlow(options, patterns, parseArgsErrors);

  if (hasFilterListFlowResult) {
    const { matchedFilesList, errors = {} } = filterListByOptionsAndPatterns(filesInCwd, options, patterns);
    filterFiles = matchedFilesList;
    collectedErrors = errors;
  }

  handleResult(filterFiles, options, collectedErrors)

} catch (error) {
  console.error('unexpected error: ', error);
  exit(1)
}

function parseArgs() {
  const MULTI_LETTERS_OPTIONS = Object.freeze({
    help: 'help',
    version: 'version',
    all: 'all',
    longFormat: 'long',
    jsonFormat: 'json',
    classicFormat: 'classic',
    useRegex: 'regex',
  });
  const SINGLE_LETTERS_OPTIONS = Object.freeze({
    help: 'h',
    version: 'v',
    all: 'a',
    longFormat: 'l',
  });

  const parsedResult = {
    options: {
      isShowHelp: false,
      isShowVersion: false,
      isShowAllFiles: false,
      isShowLongFormat: false,
      useJSONFormatOption: false,
      useClassicFormatOption: false,
      useRegex: false,
    },
    patterns: [],
    errors: {},
  };

  let isPatternMode = false;

  for (const arg of args) {
    if (isPatternMode) {
      parsedResult.patterns.push(arg);
      continue;
    }

    if (arg === '--') {
      isPatternMode = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      if (flag === MULTI_LETTERS_OPTIONS.help && !parsedResult.options.isShowVersion) {
        parsedResult.options.isShowHelp = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.version && !parsedResult.options.isShowHelp) {
        parsedResult.options.isShowVersion = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.all) {
        parsedResult.options.isShowAllFiles = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.longFormat) {
        parsedResult.options.isShowLongFormat = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.jsonFormat) {
        parsedResult.options.useJSONFormatOption = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.classicFormat) {
        parsedResult.options.useClassicFormatOption = true;
        continue;
      }

      if (flag === MULTI_LETTERS_OPTIONS.useRegex) {
        parsedResult.options.useRegex = true;
        continue;
      }

      if (!parsedResult.errors.code) {
        parsedResult.errors = {
          code: 4,
          messages: [
            `Error: Invalid option -- "${flag}"`,
            'Hint: Use --help or -h to see the list of valid options.',
            'Usage: my-ls [options] [patterns]',
          ],
        };
      }

      continue;
    }

    if (arg.startsWith('-') && arg !== '-') {
      const flags = arg.slice(1).split('');
      for (const f of flags) {
        if (f === SINGLE_LETTERS_OPTIONS.help && !parsedResult.options.isShowVersion) {
          parsedResult.options.isShowHelp = true;
          continue;
        }

        if (f === SINGLE_LETTERS_OPTIONS.version && !parsedResult.options.isShowHelp) {
          parsedResult.options.isShowVersion = true;
          continue;
        }

        if (f === SINGLE_LETTERS_OPTIONS.all) {
          parsedResult.options.isShowAllFiles = true;
          continue;
        }

        if (f === SINGLE_LETTERS_OPTIONS.longFormat) {
          parsedResult.options.isShowLongFormat = true;
          continue;
        }

        if (f === '-') {
          parsedResult.errors = {
            code: 2,
            messages: [
              'Error: Syntax error detected in provided options.',
              'Hint: Ensure your options and flags are properly formatted.',
              'Example: my-ls --all --long',
              'Usage: my-ls [options] [patterns]',
            ],
            hasSyntaxError: true,
          };
        }

        if (!parsedResult.errors.code) {
          parsedResult.errors = {
            code: 4,
            messages: [
              `Error: Invalid option - "${f}"`,
              'Hint: Use --help or -h to see the list of valid options.',
              'Usage: my-ls [options] [patterns]',
            ],
          };
        }
      }

      continue;
    }

    parsedResult.patterns.push(arg);
    isPatternMode = true;
  }

  if (parsedResult.options.useJSONFormatOption && parsedResult.options.useClassicFormatOption) {
    parsedResult.errors = {
      code: 5,
      messages: [
        'Error: Options "--json" and "--classic" cannot be used together.',
        'Hint: Use either --json or --classic, but not both.',
        'Example: my-ls --json --long',
        'Usage: my-ls [options] [patterns]',
      ],
    };
  }

  return parsedResult;
};

function hasFilterListFlow(options, patterns, errors) {
  if (errors.code) {
    return false;
  }

  if (options.isShowHelp || options.isShowVersion) {
    return false;
  }

  if (options.isShowAllFiles && patterns.length === 0) {
    return false;
  }

  return true;
};


function filterListByOptionsAndPatterns(files, options, patterns) {

  let matchedFilesList = [];
  let notFoundPatternList = [];

  if (patterns.length > 0) {
    const matchPattern = (filename, pattern, useRegex) => {
      return useRegex ? new RegExp(pattern).test(filename) : filename === pattern;
    };

    matchedFilesList = files.filter((filename) => {
      return patterns.some((pattern) => matchPattern(filename, pattern, options.useRegex));
    });

    notFoundPatternList = patterns.filter((pattern) => {
      return !matchedFilesList.some((filename) => matchPattern(filename, pattern, options.useRegex));
    });
  } else {
    matchedFilesList = files.filter((filename) => {
      const isHiddenFile = filename.startsWith('.');
      return options.isShowAllFiles || !isHiddenFile;
    });
  }

  const errors = (() => {
    if (notFoundPatternList.length === 0) { return {}; }

    return {
      code: 3,
      messages: notFoundPatternList.map((pattern) => `my-ls: ${pattern}: No files or directories match the pattern`),
    };
  })();

  return {
    matchedFilesList,
    errors,
  };
};

async function handleResult(filenameList, options, errors) {
  if (errors.hasSyntaxError) {
    console.error(errors.messages.join('\n'));
    exit(errors.code);
  }

  if (options.isShowHelp) {
    printHelp();
    exit(0);
  }

  if (options.isShowVersion) {
    console.log('1.2.3');
    exit(0);
  }

  if (errors.code && errors.code !== 3) {
    console.error(errors.messages.join('\n'));
    exit(errors.code);
  }

  const output = [];

  for (const filename of filenameList) {

    if (options.isShowLongFormat) {
      const fileStat = await stat(filename);

      const isDirectory = fileStat.isDirectory();
      const isFile = fileStat.isFile();
      const fileTypeStr = (() => {
        if (isDirectory) { return 'd'; }
        if (isFile) { return 'f'; }
        return '?';
      })();

      output.push({ name: filename, type: fileTypeStr, size: formatFileSize(fileStat.size) });
    } else {
      output.push({ name: filename });
    }
  }

  /* #region 輸出「符合預期」或「找不到符合 pattern 的檔案」 */
  if (errors.code === 3) {
    console.error(errors.messages.join('\n'));
  }

  if (options.useJSONFormatOption) {
    console.log(JSON.stringify(output));
  } else {
    output.forEach(item => {
      if (options.isShowLongFormat) {
        console.log(`${item.type} ${item.size} ${item.name}`);
      } else {
        console.log(item.name);
      }
    });
  }

  if (errors.code === 3) {
    exit(3);
  }
  /* #endregion 輸出「符合預期」或「找不到符合 pattern 的檔案」 */
};

function printHelp() {
  console.error(`
Usage: my-ls [options] [patterns]

Options:
  --version, -v       Print version information and exit.
  --help, -h          Display this help message and exit.
  --all, -a           List all files and directories, including hidden ones.
  --long, -l          Display detailed information for files and directories,
                      including type markers and human-readable sizes.
  --json              Output in JSON format. (default: classic)
                      Cannot be used together with --classic.
  --classic           Output in classic format. (default format)
                      Cannot be used together with --json.
  --regex             Enable regex pattern matching for file and directory names.
  --                  Treat subsequent arguments as patterns.

Patterns:
  Specify file or directory names to match. Patterns can be:
    - Exact names
    - Regex patterns (when --regex is enabled)

Important Rules:
  - Once the first pattern is encountered, all subsequent arguments 
    are treated as patterns, not options.

Exit Codes:
  0   Success.
  1   Unexpected error occurred.
  2   Syntax error in options.
  3   No files or directories matched the provided patterns.
  4   Invalid option provided.
  5   Mutually exclusive options (--json and --classic) used together.
`);
};

function formatFileSize(bytes) {
  const kb = 1024;
  const mb = kb * 1024;

  if (bytes < kb) {
    return `${bytes} B`;
  }

  if (bytes < mb) {
    const kilobytes = Math.floor(bytes / kb);
    return `${kilobytes} KB`;
  }

  const megabytes = Math.floor(bytes / mb);
  return `${megabytes} MB`;
};