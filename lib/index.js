
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
  const hexoImageDir = path.join(hexoRepoPath, 'source/images')
  const copiedImageDestinationPathSet = new Set()
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

      // 拷贝图片到 Hexo 目录并更新引用
      const normalizedPostPath = normalizeToPosixPath(post.path)
      const postDirectory = path.posix.dirname(normalizedPostPath)
      const baseImagePathSegments = postDirectory === '.' ? [] : postDirectory.split('/')
      const imageRegexp = /!\[(.*?)\]\((.*?)\)/gim
      content = content.replace(imageRegexp, (matchedMarkdown, altText, rawImagePath) => {
        const trimmedImagePath = rawImagePath.trim()
        if (!trimmedImagePath || isHttpLink(trimmedImagePath) || trimmedImagePath.startsWith('/')) {
          return matchedMarkdown
        }

        const sourceImageAbsolutePath = path.resolve(path.dirname(src), trimmedImagePath)
        if (!fs.existsSync(sourceImageAbsolutePath) || fs.statSync(sourceImageAbsolutePath).isDirectory()) {
          log('\tSkip Image Copy (missing file):', trimmedImagePath)
          return matchedMarkdown
        }

        const normalizedImagePath = normalizeToPosixPath(trimmedImagePath)
        const imageDirectoryWithinPost = path.posix.dirname(normalizedImagePath)
        const destinationPathSegments = baseImagePathSegments.slice()
        if (imageDirectoryWithinPost !== '.' && imageDirectoryWithinPost !== '/') {
          destinationPathSegments.push(...imageDirectoryWithinPost.split('/').filter(Boolean))
        }

        const imageFileName = path.posix.basename(normalizedImagePath)
        destinationPathSegments.push(imageFileName)

        const destinationImageAbsolutePath = path.join(hexoImageDir, ...destinationPathSegments)
        if (!copiedImageDestinationPathSet.has(destinationImageAbsolutePath)) {
          try {
            const fileUpdated = copyFileEnsuringDirectory(sourceImageAbsolutePath, destinationImageAbsolutePath)
            if (fileUpdated) {
              log('\tCopy Image:', sourceImageAbsolutePath, '->', destinationImageAbsolutePath)
            }
            else {
              log('\tReuse Existing Image:', destinationImageAbsolutePath)
            }
            copiedImageDestinationPathSet.add(destinationImageAbsolutePath)
          }
          catch (error) {
            log('\tCopy Image Failed:', sourceImageAbsolutePath, '->', destinationImageAbsolutePath, error.message)
            return matchedMarkdown
          }
        }

        const relativePathToImage = normalizeToPosixPath(path.relative(path.dirname(dst), destinationImageAbsolutePath))
        const markdownImagePath = relativePathToImage.startsWith('.') ? relativePathToImage : `./${relativePathToImage}`
        const updatedMarkdown = `![${altText}](${markdownImagePath})`
        log('\tUpdate Image Path:', matchedMarkdown, '->', updatedMarkdown)
        return updatedMarkdown
      })

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

function normalizeToPosixPath(filePath) {
  return filePath.replace(/\\/g, '/')
}

function copyFileEnsuringDirectory(sourcePath, destinationPath) {
  mkdirp.sync(path.dirname(destinationPath))

  if (fs.existsSync(destinationPath)) {
    const existingFileBuffer = fs.readFileSync(destinationPath)
    const nextFileBuffer = fs.readFileSync(sourcePath)
    if (existingFileBuffer.equals(nextFileBuffer)) {
      return false
    }
  }

  fs.copyFileSync(sourcePath, destinationPath)
  return true
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
