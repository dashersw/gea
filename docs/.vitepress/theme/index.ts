import DefaultTheme from 'vitepress/theme'
import { onMounted } from 'vue'
import CopyOrDownloadAsMarkdownButtons from 'vitepress-plugin-llms/vitepress-components/CopyOrDownloadAsMarkdownButtons.vue'
import './custom.css'

function initStarfield() {
  if (document.getElementById('starfield')) return

  const container = document.createElement('div')
  container.className = 'stars'
  const canvas = document.createElement('canvas')
  canvas.id = 'starfield'
  container.appendChild(canvas)
  document.body.appendChild(container)

  const ctx = canvas.getContext('2d')!
  let w: number, h: number
  let stars: { x: number; y: number; r: number; a: number; da: number; dx: number; dy: number; hue: number }[] = []

  function resize() {
    w = canvas.width = window.innerWidth
    h = canvas.height = window.innerHeight
  }

  function createStars(count: number) {
    stars = []
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.2,
        a: Math.random(),
        da: (Math.random() * 0.03 + 0.005) * (Math.random() < 0.5 ? 1 : -1),
        dx: (Math.random() - 0.5) * 0.1,
        dy: (Math.random() - 0.5) * 0.05,
        hue: Math.random() < 0.3 ? 280 : Math.random() < 0.5 ? 190 : 240,
      })
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    for (const s of stars) {
      s.a += s.da
      if (s.a >= 1) {
        s.a = 1
        s.da = -(Math.random() * 0.03 + 0.005)
      }
      if (s.a <= 0.05) {
        s.a = 0.05
        s.da = Math.random() * 0.03 + 0.005
      }
      s.x += s.dx
      s.y += s.dy
      if (s.x < -5) s.x = w + 5
      if (s.x > w + 5) s.x = -5
      if (s.y < -5) s.y = h + 5
      if (s.y > h + 5) s.y = -5
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${s.hue}, 60%, 85%, ${s.a})`
      ctx.fill()
      if (s.r > 1.2 && s.a > 0.6) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${s.hue}, 80%, 75%, ${s.a * 0.12})`
        ctx.fill()
      }
    }
    requestAnimationFrame(draw)
  }

  resize()
  createStars(150)
  draw()
  window.addEventListener('resize', () => {
    resize()
    createStars(150)
  })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CopyOrDownloadAsMarkdownButtons', CopyOrDownloadAsMarkdownButtons)
  },
  setup() {
    onMounted(() => {
      const logoLink = document.querySelector('.VPNavBarTitle a, .VPNavBarTitle')
      if (logoLink) {
        logoLink.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          window.location.href = '/'
        })
      }
      initStarfield()
    })
  },
}
