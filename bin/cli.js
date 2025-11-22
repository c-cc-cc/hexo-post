#!/usr/bin/env node

const path = require('path')
const { program } = require('commander');

const hexoPost = require('../lib')

program
    .version('1.0.0', '-V, --version')
    .option('-c --config [config]', 'path to config file', String)
    .option('-o --output [output]', 'path to hexo directory', String)
    .option('-v --verbose [verbose]', 'path to hexo directory', Boolean)
    .parse(process.argv)

const options = program.opts()

if (options.config && options.output) {
    hexoPost.g(path.resolve(options.config), path.resolve(process.cwd(), options.output), {verbose: options.verbose})
}
else if (options.output) {
    hexoPost.g(path.resolve(process.cwd()), path.resolve(process.cwd(), options.output), {verbose: options.verbose})
}
else {
    program.help()
}
