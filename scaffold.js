#!/usr/bin/env node

var child_process = require('child_process');
var fs = require('fs');
var fsExtra = require('fs-extra');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');

var _ = require('lodash');
var chalk = require('chalk');
var prettyJson = require('format-json');
var prettyTime = require('pretty-hrtime');
var semver = require('semver');
var yaml = require('js-yaml');

var SUPPORTED_VERSIONS = '1.0.x';
var cwd = process.cwd();
var start = null;
var blueprint = null;
var projectFolder = null;

var packageJson = {
    name: '',
    version: '',
    description: '',
    keywords: [],
    homepage: '',
    bugs: {
        email: '',
        url: ''
    },
    license: '',
    author: {
        email: '',
        name: '',
        url: ''
    },
    contributors: [],
    repository: {
        type: 'git',
        url: ''
    },
    dependencies: {},
    devDependencies: {},
    preferGlobal: false,
    private: false
};

var logger = {
    error: function () {
        'use strict';
        var args = Array.prototype.slice.call(arguments);
        console.error(chalk.red.bold.bgBlack(endTimer(start) + ' ' + args.join(' ')));
        process.exit(1);
    },
    log: function () {
        'use strict';
        var args = Array.prototype.slice.call(arguments);
        console.log(chalk.blue.bgBlack(endTimer(start) + ' ' + args.join(' ')));
    }
};

var startTimer = function () {
    'use strict';
    start = process.hrtime();
};

var endTimer = function () {
    'use strict';
    var end = process.hrtime(start);
    return '[' + prettyTime(end, {precise: true}) + ']';
};

var normalize = function () {
    'use strict';
    var args = Array.prototype.slice.call(arguments);
    return path.normalize(args.join('/'));
};

var camelCaseHyphenatedIdentifier = function (identifier) {
    'use strict';
    var parts = identifier.split('-');
    if (parts.length === 1) {
        return identifier;
    }
    var escaped = parts[0];
    for (var i = 1, j = parts.length; i < j; ++i) {
        var part = parts[i];
        var toUpper = part.charAt(0).toUpperCase() + part.substr(1);
        escaped = escaped + toUpper;
    }
    return escaped;
};

var loadBlueprint = function () {
    'use strict';
    logger.log('loading blueprint...');
    try {
        var file = fs.readFileSync(normalize(cwd, 'blueprint.yaml'), {encoding: 'utf8'});
        var bp = yaml.safeLoad(file);
        logger.log(JSON.stringify(bp));
        blueprint = bp;
    } catch (e) {
        logger.error(e);
    }
};

var versionCheck = function () {
    'use strict';
    logger.log('checking version support...');
    if (!semver.satisfies(blueprint.version, SUPPORTED_VERSIONS)) {
        logger.error('found version:', blueprint.version + ',', 'supported versions:', SUPPORTED_VERSIONS);
    }
};

var gitkeep = function (path) {
    'use strict';
    fs.writeFileSync(normalize(path, '.gitkeep'), '');
};

var mkdir = function (path, dir, key) {
    'use strict';
    var newDir = normalize(path, dir);
    mkdirp.sync(newDir);
    if (key === null) {
        gitkeep(newDir);
    } else {
        var keys = Object.keys(key);
        for (var i = 0, j = keys.length; i < j; ++i) {
            mkdir(newDir, keys[i], key[keys[i]]);
        }
    }
};

var createProjectFolder = function () {
    'use strict';
    logger.log('creating project folder...');
    projectFolder = normalize(cwd, '../', blueprint.npm.name);
    packageJson.name = blueprint.npm.name;
    if (fs.existsSync(projectFolder)) {
        rimraf.sync(projectFolder);
    }
    mkdirp.sync(projectFolder);
};

var initializeProject = function () {
    'use strict';
    logger.log('initializing project...');
    fs.writeFileSync(normalize(projectFolder, 'README.md'), '# idd-scaffold generated');
    fs.writeFileSync(normalize(projectFolder, 'LICENSE'), '');
    fsExtra.copySync(normalize(cwd, '.gitignore'), normalize(projectFolder, '.gitignore'));
    child_process.spawnSync('git', ['init'], {
        cwd: projectFolder,
        encoding: 'utf8'
    });
};

var doGulp = function () {
    'use strict';
    var gulp = blueprint.npm.gulp;
    var libs = [];
    var requires = [];
    if (gulp !== null) {
        logger.log('installing gulp globally, asynchronously...');
        child_process.spawn('npm', ['install', 'gulp', '--global'], {});
        logger.log('configuring gulp...');
        libs.push('gulp');
        packageJson.devDependencies.gulp = 'latest';
        if (_.isObject(gulp)) {
            var keys = Object.keys(gulp);
            for (var i = 0, j = keys.length; i < j; ++i) {
                packageJson.devDependencies[keys[i]] = gulp[keys[i]] || 'latest';
                libs.push(keys[i]);
            }
            for (var i = 0, j = libs.length; i < j; ++i) {
                requires.push('var ' + camelCaseHyphenatedIdentifier(libs[i]) + ' = require("' + libs[i] + '");');
            }
        }
        var requiresStr = requires.join('\r\n');
        requiresStr = requiresStr + '\r\n\r\n';
        requiresStr = requiresStr + 'gulp.task("default", []);\r\n';
        fs.writeFileSync(normalize(projectFolder, 'gulpfile.js'), requiresStr, {encoding: 'utf8'});
    }
};

var doGrunt = function () {
    'use strict';
    var grunt = blueprint.npm.grunt;
    var libs = [];
    var requires = [];
    if (grunt !== null) {
        logger.log('installing grunt globally, asynchronously...');
        child_process.spawn('npm', ['install', 'grunt-cli', '--global'], {});
        logger.log('configuring grunt...');
        if (_.isObject(grunt)) {
            var keys = Object.keys(grunt);
            for (var i = 0, j = keys.length; i < j; ++i) {
                packageJson.devDependencies[keys[i]] = grunt[keys[i]] || 'latest';
                libs.push(keys[i]);
            }
        }
        var requiresStr = requires.join('\r\n');
        requiresStr = requiresStr + '\r\n';
        requiresStr = requiresStr + 'module.exports = function (grunt) {\r\n';
        requiresStr = requiresStr + '  grunt.initConfig({\r\n';
        requiresStr = requiresStr + '  });\r\n\r\n';
        for (var i = 0, j = libs.length; i < j; ++i) {
            requiresStr = requiresStr + '  grunt.loadNpmTasks("' + libs[i] + '");\r\n';
        }
        requiresStr = requiresStr + '\r\n';
        requiresStr = requiresStr + '  grunt.registerTask("default", []);\r\n';
        requiresStr = requiresStr + '};\r\n';
        fs.writeFileSync(normalize(projectFolder, 'Gruntfile.js'), requiresStr, {encoding: 'utf8'});
    }
};

var doNpm = function () {
    'use strict';
    logger.log('running npm...');
    var prodDeps = blueprint.npm.dependencies.prod;
    if (_.isObject(prodDeps)) {
        var keys = Object.keys(prodDeps);
        for (var i = 0, j = keys.length; i < j; ++i) {
            packageJson.dependencies[keys[i]] = prodDeps[keys[i]] || 'latest';
        }
    }
    var devDeps = blueprint.npm.dependencies.dev;
    if (_.isObject(devDeps)) {
        var keys = Object.keys(devDeps);
        for (var i = 0, j = keys.length; i < j; ++i) {
            packageJson.devDependencies[keys[i]] = devDeps[keys[i]] || 'latest';
        }
    }
    fs.writeFileSync(normalize(projectFolder, 'package.json'), prettyJson.plain(packageJson), {encoding: 'utf8'});
    child_process.spawnSync('npm', ['install'], {
        cwd: projectFolder,
        encoding: 'utf8'
    });
};

var createProjectStructure = function () {
    'use strict';
    logger.log('creating project structure...');
    var structure = blueprint.structure;
    var keys = Object.keys(structure);
    for (var i = 0, j = keys.length; i < j; ++i) {
        mkdir(projectFolder, keys[i], structure[keys[i]]);
    }
};

module.exports = function () {
    'use strict';
    startTimer();
    loadBlueprint();
    versionCheck();
    createProjectFolder();
    initializeProject();
    doGulp();
    doGrunt();
    doNpm();
    createProjectStructure();
    logger.log('done. project is scaffolded.');
};

module.exports();
