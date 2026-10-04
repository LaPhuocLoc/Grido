import { describe, expect, it } from 'vitest'
import { frameGeometry, remapTexts } from '../src/lib/frames/geometry'
import { frameInfo } from '../src/lib/frames/info'
import { FRAMES, frameFields, frameLines, frameTemplate } from '../src/lib/frames/templates'
import { wordmark } from '../src/lib/frames/wordmark'

describe('frameInfo', () => {
  const fuji = {
    make: 'FUJIFILM',
    model: 'X-T5',
    lens: 'XF35mmF1.4 R',
    focalLength: 35,
    fNumber: 1.4,
    exposureTime: 0.01,
    iso: 160,
    filmSimulation: 'Classic Chrome',
    takenAt: '2022-12-11T17:10:30+08:00',
    artist: 'Mike',
  }

  it('turns the EXIF of a photo into the words printed on a frame', () => {
    expect(frameInfo(fuji, {})).toEqual({
      brand: 'FUJIFILM',
      model: 'X-T5',
      lens: 'XF35mmF1.4 R',
      settings: '35mm  f/1.4  1/100s  ISO 160',
      film: 'Classic Chrome',
      date: '2022.12.11 17:10',
      note: 'Mike',
    })
  })

  it('leaves everything blank for a photo without EXIF', () => {
    for (const exif of [null, undefined, {}])
      expect(frameInfo(exif, {})).toEqual({ brand: '', model: '', lens: '', settings: '', film: '', date: '', note: '' })
  })

  it('only lists the settings the camera recorded', () => {
    expect(frameInfo({ fNumber: 8, iso: 100 }, {}).settings).toBe('f/8  ISO 100')
  })

  it.each([
    [2, '2s'],
    [30, '30s'],
    [0.5, '0.5s'],
    [0.4, '0.4s'],
    [1 / 3, '1/3s'],
    [1 / 60, '1/60s'],
    [1 / 8000, '1/8000s'],
  ])('writes a shutter time of %f s as %s', (exposureTime, text) => {
    expect(frameInfo({ exposureTime }, {}).settings).toBe(text)
  })

  it('rounds the focal length and keeps one decimal of the aperture', () => {
    expect(frameInfo({ focalLength: 23.3, fNumber: 2.8 }, {}).settings).toBe('23mm  f/2.8')
  })

  it.each([
    ['NIKON CORPORATION', 'NIKON Z 6_2', 'Nikon', 'Z 6II'],
    ['Canon', 'Canon EOS R6m2', 'Canon', 'EOS R6m2'],
    ['SONY', 'ILCE-7M4', 'SONY', 'A7 IV'],
    ['SONY', 'ILCE-7RM5', 'SONY', 'A7R V'],
    ['SONY', 'ILCE-6400', 'SONY', 'A6400'],
    ['SONY', 'ZV-E10', 'SONY', 'ZV-E10'],
    ['OLYMPUS IMAGING CORP.', 'E-M10MarkII', 'OLYMPUS', 'E-M10MarkII'],
    ['Apple', 'iPhone 15 Pro', 'Apple', 'iPhone 15 Pro'],
    ['RICOH IMAGING COMPANY, LTD.', 'RICOH GR III', 'RICOH', 'GR III'],
  ])('reads %s / %s as %s %s', (make, model, brand, name) => {
    expect(frameInfo({ make, model }, {})).toMatchObject({ brand, model: name })
  })

  it('lets the user replace or blank any field', () => {
    expect(frameInfo(fuji, { model: 'X100VI', lens: '', note: 'Đà Lạt' })).toMatchObject({ model: 'X100VI', lens: '', note: 'Đà Lạt', brand: 'FUJIFILM' })
  })
})

describe('frame templates', () => {
  const info = frameInfo({ make: 'FUJIFILM', model: 'X-T5', filmSimulation: 'Classic Chrome' }, {})

  it('have unique ids and can be looked up', () => {
    expect(new Set(FRAMES.map((f) => f.id)).size).toBe(FRAMES.length)
    expect(frameTemplate(FRAMES[0].id)).toBe(FRAMES[0])
    expect(frameTemplate('no-such-frame')).toBeNull()
  })

  it('fills the fields into a line', () => {
    expect(frameLines([{ text: 'Shot on {model}', size: 2, weight: 500 }], info).map((l) => l.text)).toEqual(['Shot on X-T5'])
  })

  it('drops a line when one of its fields is blank', () => {
    expect(frameLines([{ text: '{lens}', size: 2, weight: 500 }, { text: '{brand}', size: 2, weight: 700 }], info).map((l) => l.text)).toEqual(['FUJIFILM'])
  })

  it('falls back to the other wording when the first one has a blank field', () => {
    const line = { text: '{film}', or: '{model}', size: 2, weight: 600 as const, upper: true }
    expect(frameLines([line], info)[0].text).toBe('CLASSIC CHROME')
    expect(frameLines([line], { ...info, film: '' })[0].text).toBe('X-T5')
  })

  it('covers every kind of frame of the reference set', () => {
    expect(FRAMES.map((f) => f.id)).toEqual(['giua', 'shot-on', 'hai-ben', 'chi-tiet', 'dai-day', 'in-de', 'logo', 'dia-diem', 'kinh-mo', 'the-mo', 'phim', 'dien-anh'])
  })

  it('marks which part of a line is the brand, so it can be written the way the maker writes it', () => {
    const [line] = frameLines([{ text: '{brand}  {model}', size: 3, weight: 700 }], info)
    expect(line.text).toBe('FUJIFILM  X-T5')
    expect(line.runs).toEqual([{ text: 'FUJIFILM', brand: true }, { text: '  X-T5' }])
  })

  it('can separate the settings with a divider', () => {
    const settings = frameInfo({ fNumber: 8, iso: 100 }, {})
    expect(frameLines([{ text: '{settings}', sep: ' | ', size: 2, weight: 500 }], settings)[0].text).toBe('f/8 | ISO 100')
  })

  it('knows which fields a template prints, fallbacks included', () => {
    const both = FRAMES.find((f) => f.id === 'hai-ben')!
    expect(frameFields(both)).toEqual(['brand', 'model', 'film'])
    expect(frameFields(FRAMES.find((f) => f.id === 'dien-anh')!)).toEqual([])
  })
})

describe('frameGeometry', () => {
  const frame = { ...FRAMES[0], pad: { top: 3, side: 3, bottom: 14 } }

  it('grows the file around the photo when the size follows the photo, so no pixel is cropped or resampled', () => {
    expect(frameGeometry(frame, 1, { width: 6000, height: 4000 }, false, 1.5)).toEqual({
      width: 6240,
      height: 4680,
      photo: { x: 120, y: 120, w: 6000, h: 4000 },
      pad: { top: 120, side: 120, bottom: 560 },
      card: null,
      // Chữ nằm trong hai dải trên / dưới, giữa mép trái và mép phải của ảnh.
      text: { left: 120, right: 6120, top: [0, 120], bottom: [4120, 4680] },
      unit: 40,
    })
  })

  it('scales the borders with the thickness setting', () => {
    expect(frameGeometry(frame, 2, { width: 6000, height: 4000 }, false, 1.5)).toMatchObject({ width: 6480, height: 5360, unit: 80 })
  })

  it('keeps a fixed size and fits the whole photo inside the borders', () => {
    const g = frameGeometry(frame, 1, { width: 1080, height: 1350 }, true, 1.5)
    expect(g).toMatchObject({ width: 1080, height: 1350, pad: { top: 32, side: 32, bottom: 151 } })
    // Vùng ảnh 1016 × 1167; ảnh 3:2 nằm vừa bề ngang, giữa chiều dọc.
    expect(g.photo).toEqual({ x: 32, y: 277, w: 1016, h: 677 })
  })

  it('fits a tall photo by height in a fixed size', () => {
    const g = frameGeometry(frame, 1, { width: 1080, height: 1080 }, true, 0.5)
    expect(g.photo.h).toBe(1080 - 32 - 151)
    expect(g.photo.w).toBe(Math.round(g.photo.h * 0.5))
    expect(g.photo.x).toBe(Math.round((1080 - g.photo.w) / 2))
  })

  it('fills the room between the borders when asked to, for the user to crop by hand', () => {
    const g = frameGeometry(frame, 1, { width: 1080, height: 1350 }, true, 1.5, true)
    expect(g.photo).toEqual({ x: 32, y: 32, w: 1016, h: 1167 })
  })

  it('wraps the photo in a card that carries the words, inside the outer border', () => {
    const carded = { pad: { top: 10, side: 10, bottom: 10 }, card: { pad: { top: 1, side: 1, bottom: 7 } } }
    const g = frameGeometry(carded, 1, { width: 6000, height: 4000 }, false, 1.5)
    expect(g).toMatchObject({
      width: 6000 + 2 * (400 + 40),
      height: 4000 + 400 + 40 + 280 + 400,
      photo: { x: 440, y: 440, w: 6000, h: 4000 },
      card: { x: 400, y: 400, w: 6080, h: 4320 },
      text: { left: 440, right: 6440, top: [400, 440], bottom: [4440, 4720] },
    })
  })

  it('keeps the card around the photo when the photo is fitted into a fixed size', () => {
    const carded = { pad: { top: 10, side: 10, bottom: 10 }, card: { pad: { top: 1, side: 1, bottom: 7 } } }
    const g = frameGeometry(carded, 1, { width: 1000, height: 1000 }, true, 2)
    // Vùng ảnh 780 × 720; ảnh 2:1 rộng 780, cao 390, nằm giữa.
    expect(g.photo).toEqual({ x: 110, y: 275, w: 780, h: 390 })
    expect(g.card).toEqual({ x: 100, y: 265, w: 800, h: 470 })
  })

  it('never makes a file larger than the largest size the app exports', () => {
    const g = frameGeometry(frame, 1, { width: 9900, height: 6600 }, false, 1.5)
    expect(g.width).toBe(10000)
    expect(g.photo.w / g.photo.h).toBeCloseTo(1.5, 2)
    expect(g.photo.y + g.photo.h + g.pad.bottom).toBe(g.height)
  })
})

describe('remapTexts', () => {
  const bare = { width: 6000, height: 4000, photo: { x: 0, y: 0, w: 6000, h: 4000 } }
  const framed = { width: 6240, height: 4680, photo: { x: 120, y: 120, w: 6000, h: 4000 } }
  const text = { id: 't', x: 0.5, y: 0.25, size: 10, width: 0.5 as number | null }

  it('keeps a text on the same spot of the photo, at the same size, when a frame is added', () => {
    const [moved] = remapTexts([text], bare, framed)
    expect(moved.x * framed.width).toBeCloseTo(120 + 3000)
    expect(moved.y * framed.height).toBeCloseTo(120 + 1000)
    // Cỡ chữ tính theo % cạnh ngắn: 400px trên ảnh trần vẫn là 400px khi có khung.
    expect((moved.size * framed.height) / 100).toBeCloseTo(400)
    expect(moved.width! * framed.width).toBeCloseTo(3000)
  })

  it('puts the text back exactly when the frame is removed', () => {
    const [back] = remapTexts(remapTexts([text], bare, framed), framed, bare)
    expect(back.x).toBeCloseTo(text.x)
    expect(back.y).toBeCloseTo(text.y)
    expect(back.size).toBeCloseTo(text.size)
    expect(back.width).toBeCloseTo(0.5)
  })

  it('returns the same list when nothing moved', () => {
    const texts = [text]
    expect(remapTexts(texts, framed, { ...framed })).toBe(texts)
  })
})

describe('wordmark', () => {
  it('writes FUJIFILM with its two-coloured I', () => {
    expect(wordmark('FUJIFILM')).toMatchObject({ weight: 800, accent: { at: 3, color: '#e60012' } })
  })

  it('recognises a brand however the user typed it', () => {
    expect(wordmark('fujifilm')).toEqual(wordmark('FUJIFILM'))
    expect(wordmark('Sony')).toMatchObject({ family: 'serif' })
    expect(wordmark('Canon')).toMatchObject({ color: '#cc0000' })
  })

  it('has nothing special for a brand it does not know', () => {
    expect(wordmark('Hãng lạ')).toBeNull()
  })
})
