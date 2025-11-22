
/* eslint-disable no-sync */
/* eslint-disable no-console */
/* eslint-disable max-statements */

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const yaml = require('js-yaml')

exports.g = function g(configFilePaths, hexoRepoPath, options) {
  function log(...args) {
    if (options.verbose) {
      console.log(...args)
    }
  }

  options = options || {}

  const configFileContents = [
    path.join(configFilePaths, 'hexo.yaml')
  ].map((configFilePath) => fs.readFileSync(configFilePath, 'utf8'))
    
  const configs = yaml.loadAll(configFileContents)

  const srcArticleFileSet = new Set()
  configs.forEach((config) => {
    config.posts.forEach((post) => {
      if (post.show === false) {
        return
      }

      const src = path.join(configFilePaths, post.path)
      srcArticleFileSet.add(src)
    })
  })

  const hexoPostDir = path.join(hexoRepoPath, 'source/_posts')
  const dstArticleFiles = []
  configs.forEach((config) => {
    config.posts.forEach((post) => {
      if (post.show === false) {
        return
      }

      const src = path.join(configFilePaths, post.path)
      const dst = path.join(hexoPostDir, post.path)

      dstArticleFiles.push(dst)

      log(`Process: ${src}`)
            
      let content = fs.readFileSync(src).toString().replace(/#.*$/im, '')

      // 替换图片地址
      let imageRegexpExecResult
      const imageRegexp = /!\[(.*)\]\((.*)\)/gim
      while ((imageRegexpExecResult = imageRegexp.exec(content))) {
        const imagePath = imageRegexpExecResult[2]
        if (imagePath && !isHttpLink(imagePath)) {
          if (!post.imageBaseUrl) {
            post.imageBaseUrl = config.repository
          }
          if (!post.imageBaseUrl.endsWith('/')) {
            post.imageBaseUrl += '/'
          }
          post.imageBaseUrl = post.imageBaseUrl.replace('github.com', 'raw.githubusercontent.com')
          const newImagePath = `${post.imageBaseUrl}master/${path.dirname(post.path)}/${imagePath}`
          const from = imageRegexpExecResult[0]
          const to = `![${imageRegexpExecResult[1]}](${newImagePath})`
          log('\tReplace Image Url:', from, '->', to)
          content = content.replace(from, to)
        }
      }

      // 替换链接地址
      let linkRegexpExecResult
      const linkRegexp = /[^!]\[(.*)\]\((.*)\)/gim
      while ((linkRegexpExecResult = linkRegexp.exec(content))) {
        const link = linkRegexpExecResult[2]
        if (link && !isHttpLink(link)) {
          post.linkBaseUrl = config.repository
          if (!post.linkBaseUrl.endsWith('/')) {
            post.linkBaseUrl += '/'
          }

          const linkFilePath = path.join(path.dirname(src), link)

          if (srcArticleFileSet.has(linkFilePath)) {
            const newLinkUrl = `/posts${linkFilePath.replace(configFilePaths, '').replace(/\.md$/, '')}`
            const from = linkRegexpExecResult[0].replace(/^\n+/, '')
            const to = `[${linkRegexpExecResult[1]}](${newLinkUrl})`
            content = content.replace(from, to)
            log('\tReplace Link Url:', from, '->', to)
          }
          else {
            const newLinkUrl = `${post.linkBaseUrl}tree/master/${path.dirname(post.path)}/${link}`
            const from = linkRegexpExecResult[0].replace(/^\n+/, '')
            const to = `[${linkRegexpExecResult[1]}](${newLinkUrl})`
            content = content.replace(from, to)
            log('\tReplace Link Url:', from, '->', to)
          }
        }
      }

      if (fs.existsSync(dst) && fs.readFileSync(dst).toString().includes(content)) {
        log(`\tContent Not Changed: ${src}\n`)
        return
      }

      const tags = Array.isArray(post.tags) ? post.tags : (post.tags || '').split(' ')
      const categories = Array.isArray(post.categories) ? post.categories : (post.categories || '未分类').split(' ')
    
      const footer = config.repository ? `<a href="${config.repository}/tree/master/${post.path}" >查看源文件</a>&nbsp;&nbsp;<a href="${config.repository}/edit/master/${post.path}">编辑源文件</a>` : ''

      content = ''
                + '---\n'
                + `title: ${post.title}\n`
                + `date: ${new Date(post.date).toISOString()}\n`
                + `updated: ${new Date().toISOString()}\n`
                + `tags: [${tags.toString()}]\n`
                + `categories: [${categories.toString()}]\n`
                + '---'
                + '\n\n'
                + content
                + '\n\n'
                + '---'
                + '\n\n'
                + footer
                + '\n'

      mkdirp.sync(path.dirname(dst))
      fs.writeFileSync(dst, content, {encoding: 'utf8'})
      log()
    })
  })

  arrayDiff(ls(hexoPostDir), dstArticleFiles).forEach((file) => {
    log(`Unlink: ${file}`)
    fs.unlinkSync(file)
  })
}

function isHttpLink(href) {
  return (href.startsWith('http://') || href.startsWith('https://'))
}

function travel(dir, callback) {
  fs.readdirSync(dir).forEach((fileName) => {
    const fullPath = path.join(dir, fileName)

    if (fs.statSync(fullPath).isDirectory()) {
      return travel(fullPath, callback)
    }
    else {
      return callback(fullPath)
    }
  })
}

function ls(dir) {
  const files = []
  travel(dir, (file) => files.push(file))
  return files
}

function arrayDiff(a, ...values) {
  const set = new Set([].concat(...values))
  return a.filter((element) => !set.has(element))
}
