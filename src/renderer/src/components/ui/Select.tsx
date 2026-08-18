import { useEffect, useId, useRef, useState } from 'react'

export interface SelectOption { value: string; label: string; disabled?: boolean }

export function Select({ value, options, onChange, label, disabled = false, className = '' }: {
  value: string; options: SelectOption[]; onChange(value: string): void; label: string; disabled?: boolean; className?: string
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const [active, setActive] = useState(Math.max(0, options.findIndex((option) => option.value === value)))
  const selected = options.find((option) => option.value === value) ?? options[0]
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close) }, [open])
  useEffect(() => setActive(Math.max(0, options.findIndex((option) => option.value === value))), [options, value])
  useEffect(() => {
    if (!open) return
    const rect = root.current?.getBoundingClientRect()
    if (rect) setAbove(window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom)
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id, open])
  const enabledIndexes = () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0)
  const move = (direction: 1 | -1) => { if (!options.length) return; let next = active; do { next = (next + direction + options.length) % options.length } while (options[next]?.disabled && next !== active); setActive(next) }
  const choose = (index: number) => { const option = options[index]; if (!option || option.disabled) return; onChange(option.value); setOpen(false) }
  return <div ref={root} className={`lumi-select ${open ? 'is-open' : ''} ${above ? 'is-above' : ''} ${className}`}>
    <button type="button" role="combobox" aria-label={label} aria-controls={id} aria-activedescendant={open ? `${id}-${active}` : undefined} aria-expanded={open} aria-haspopup="listbox" disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) setOpen(true); else move(event.key === 'ArrowDown' ? 1 : -1) }
      if (event.key === 'Home') { event.preventDefault(); const first = enabledIndexes()[0]; if (first !== undefined) setActive(first); setOpen(true) }
      if (event.key === 'End') { event.preventDefault(); const enabled = enabledIndexes(); const last = enabled.at(-1); if (last !== undefined) setActive(last); setOpen(true) }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else setOpen(true) }
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
    }}><span>{selected?.label ?? 'Selecione'}</span><i aria-hidden="true">⌄</i></button>
    {open && <div id={id} role="listbox" aria-label={label} className="lumi-select__list">{options.map((option, index) => <button id={`${id}-${index}`} type="button" tabIndex={-1} key={option.value} role="option" aria-selected={option.value === value} disabled={option.disabled} className={index === active ? 'is-active' : ''} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>{option.label}{option.value === value && <span aria-hidden="true">✓</span>}</button>)}</div>}
  </div>
}
