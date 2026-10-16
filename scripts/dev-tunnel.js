import { spawn } from 'child_process'

const children = []

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill('SIGTERM')
      }
    }
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

run('node', ['server.js'])
run('cloudflared', ['tunnel', '--url', 'http://localhost:3001'])
