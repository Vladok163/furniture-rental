import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { differenceInDays, parseISO, format } from 'date-fns'

const SOURCES = ['Авито', 'Сарафан', 'Повторный', 'Другое']

export default function OrderModal({ onClose, onSaved, editOrder = null, prefillClient = null }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [clients, setClients] = useState([])
  const [inventory, setInventory] = useState([])
  const [busyMap, setBusyMap] = useState({})

  // client fields
  const [clientQuery, setClientQuery] = useState(prefillClient?.name || '')
  const [selectedClient, setSelectedClient] = useState(prefillClient || null)
  const [showAc, setShowAc] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [clientSource, setClientSource] = useState('Авито')
  const [clientNotes, setClientNotes] = useState('')
  const [isNewClient, setIsNewClient] = useState(!prefillClient)

  // order fields
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [qty, setQty] = useState({})
  const [discount, setDiscount] = useState('')
  const [prepayment, setPrepayment] = useState('')
  const [delivery, setDelivery] = useState('Самовывоз')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [invLoaded, setInvLoaded] = useState(false)

  const acRef = useRef()

  useEffect(() => {
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients(data || []))

    supabase.from('inventory').select('*').order('id').then(({ data }) => {
      const inv = data || []
      setInventory(inv)
      // FIX: initialize qty for every item
      const init = {}
      inv.forEach(i => { init[i.id] = 0 })
      setQty(init)
      setInvLoaded(true)
    })
  }, [])

  // If editing — prefill qty from existing order_items
  useEffect(() => {
    if (editOrder && invLoaded && inventory.length > 0) {
      setStartDate(editOrder.start_date || today)
      setEndDate(editOrder.end_date || today)
      setDiscount(String(editOrder.discount || ''))
      setPrepayment(String(editOrder.prepayment || ''))
      setDelivery(editOrder.delivery_type || 'Самовывоз')
      setAddress(editOrder.delivery_address || '')
      setNotes(editOrder.notes || '')
      if (editOrder.clients) {
        setSelectedClient(editOrder.clients)
        setClientQuery(editOrder.clients.name)
        setIsNewClient(false)
      }
      // load order items
      supabase.from('order_items').select('*').eq('order_id', editOrder.id).then(({ data }) => {
        if (data) {
          const qMap = {}
          inventory.forEach(i => { qMap[i.id] = 0 })
          data.forEach(it => { qMap[it.inventory_id] = it.quantity })
          setQty(qMap)
        }
      })
    }
  }, [editOrder, invLoaded])

  useEffect(() => {
    if (!startDate || !endDate || inventory.length === 0) return
    fetchBusy()
  }, [startDate, endDate, inventory])

  async function fetchBusy() {
    const { data } = await supabase
      .from('orders')
      .select('id, start_date, end_date, order_items(inventory_id, quantity)')
      .neq('status', 'done')
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)

    const map = {}
    inventory.forEach(i => { map[i.id] = 0 })
    ;(data || []).forEach(order => {
      if (editOrder && order.id === editOrder.id) return
      const s = parseISO(order.start_date)
      const e = parseISO(order.end_date)
      const qs = parseISO(startDate)
      const qe = parseISO(endDate)
      if (s <= qe && e >= qs) {
        ;(order.order_items || []).forEach(item => {
          map[item.inventory_id] = (map[item.inventory_id] || 0) + item.quantity
        })
      }
    })
    setBusyMap(map)
  }

  const acResults = clientQuery.length > 0 && !selectedClient
    ? clients.filter(c =>
        c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
        (c.phone || '').includes(clientQuery)
      ).slice(0, 6)
    : []

  function selectClient(c) {
    setSelectedClient(c)
    setClientQuery(c.name)
    setIsNewClient(false)
    setShowAc(false)
  }

  function clearClient() {
    setSelectedClient(null)
    setClientQuery('')
    setIsNewClient(true)
    setNewClientName('')
    setNewClientPhone('')
  }

  function changeQty(id, delta) {
    setQty(q => ({ ...q, [id]: Math.max(0, (q[id] || 0) + delta) }))
  }

  const days = Math.max(1, differenceInDays(parseISO(endDate || today), parseISO(startDate || today)))
  const disc = parseFloat(discount) || 0
  const prepay = parseFloat(prepayment) || 0
  const rawTotal = inventory.reduce((s, i) => s + (qty[i.id] || 0) * i.price_per_day, 0) * days
  const total = Math.round(rawTotal * (1 - disc / 100))
  const rest = Math.max(0, total - prepay)

  function available(inv) {
    return inv.total_qty - (busyMap[inv.id] || 0)
  }

  function hasConflict() {
    return inventory.some(i => (qty[i.id] || 0) > available(i))
  }

  // FIX: use clientQuery as fallback for name when newClientName not yet typed
  function resolveNewClientName() {
    return (newClientName.trim() || clientQuery.trim())
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      let clientId = selectedClient?.id
      if (!clientId) {
        // FIX: fallback to clientQuery if newClientName not separately filled
        const name = resolveNewClientName()
        if (!name) { alert('Укажите имя клиента'); setSaving(false); return }
        const { data: nc, error } = await supabase.from('clients')
          .insert({ name, phone: newClientPhone, source: clientSource, notes: clientNotes })
          .select().single()
        if (error) throw error
        clientId = nc.id
      }

      const orderData = {
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        delivery_type: delivery,
        delivery_address: address,
        prepayment: prepay,
        total_amount: total,
        discount: disc,
        notes,
        status: 'active',
      }

      let orderId
      if (editOrder) {
        await supabase.from('orders').update(orderData).eq('id', editOrder.id)
        await supabase.from('order_items').delete().eq('order_id', editOrder.id)
        orderId = editOrder.id
      } else {
        const { data: o, error } = await supabase.from('orders').insert(orderData).select().single()
        if (error) throw error
        orderId = o.id
      }

      const items = inventory
        .filter(i => (qty[i.id] || 0) > 0)
        .map(i => ({ order_id: orderId, inventory_id: i.id, quantity: qty[i.id], price_per_day: i.price_per_day }))
      if (items.length > 0) {
        await supabase.from('order_items').insert(items)
      }

      onSaved()
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // Show new client block: typed something, no existing client selected, no autocomplete matches
  const showNewClientBlock = !selectedClient && clientQuery.length > 0 && acResults.length === 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{editOrder ? 'Редактировать заказ' : 'Новый заказ'}</div>

        {/* CLIENT SEARCH */}
        <div className="form-group">
          <div className="form-label">Клиент</div>
          <div className="autocomplete-wrap" ref={acRef}>
            <input
              className="form-input"
              placeholder="Найти существующего или ввести нового..."
              value={clientQuery}
              disabled={!!selectedClient}
              onChange={e => {
                setClientQuery(e.target.value)
                setShowAc(true)
                setSelectedClient(null)
                setIsNewClient(true)
                setNewClientName(e.target.value)
              }}
              onFocus={() => setShowAc(true)}
            />
            {showAc && acResults.length > 0 && (
              <div className="autocomplete-list">
                {acResults.map(c => (
                  <div key={c.id} className="autocomplete-item" onClick={() => selectClient(c)}>
                    <div>{c.name}</div>
                    <div className="autocomplete-item-sub">{c.phone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SELECTED CLIENT CHIP */}
        {selectedClient && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--green-bg)',borderRadius:'var(--radius-sm)'}}>
            <div>
              <span style={{fontWeight:600}}>{selectedClient.name}</span>
              <span style={{fontSize:'13px',color:'var(--text-muted)',marginLeft:10}}>{selectedClient.phone}</span>
            </div>
            <button onClick={clearClient} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:20,lineHeight:1}}>×</button>
          </div>
        )}

        {/* NEW CLIENT BLOCK */}
        {showNewClientBlock && (
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{fontSize:'13px',color:'var(--text-muted)',fontWeight:500}}>Новый клиент</div>
            <div className="form-row-2">
              <div className="form-group">
                <div className="form-label">Имя</div>
                <input className="form-input" value={newClientName || clientQuery}
                  onChange={e => setNewClientName(e.target.value)} placeholder="Иван Петров" />
              </div>
              <div className="form-group">
                <div className="form-label">Телефон</div>
                <input className="form-input" value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)} placeholder="+7 900 000-00-00" />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <div className="form-label">Откуда клиент</div>
                <select className="form-select" value={clientSource} onChange={e => setClientSource(e.target.value)}>
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <div className="form-label">Заметка</div>
                <input className="form-input" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Любой комментарий" />
              </div>
            </div>
          </div>
        )}

        {/* DATES */}
        <div className="form-row-2">
          <div className="form-group">
            <div className="form-label">Дата выдачи</div>
            <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <div className="form-label">Дата возврата</div>
            <input className="form-input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* FURNITURE */}
        <div className="form-group">
          <div className="form-label">Мебель</div>
          {!invLoaded ? (
            <div style={{padding:'12px',color:'var(--text-muted)',fontSize:14}}>Загрузка...</div>
          ) : (
            <div className="qty-list">
              {inventory.map(inv => {
                const avail = available(inv)
                const cur = qty[inv.id] || 0
                const isWarn = cur > avail
                return (
                  <div key={inv.id} className={`qty-item${isWarn ? ' warn' : ''}`}>
                    <div className="qty-item-info">
                      <div className="qty-item-name">{inv.name}</div>
                      <div className="qty-item-price">{inv.price_per_day.toLocaleString('ru-RU')} ₽/сут · свободно: {avail} из {inv.total_qty}</div>
                      {isWarn && <div className="qty-warn-text">⚠ Не хватает {cur - avail} шт. на эти даты</div>}
                    </div>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => changeQty(inv.id, -1)}>−</button>
                      <span className="qty-num">{cur}</span>
                      <button className="qty-btn" onClick={() => changeQty(inv.id, 1)}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* DISCOUNT + PREPAYMENT */}
        <div className="form-row-2">
          <div className="form-group">
            <div className="form-label">Скидка %</div>
            <input className="form-input" type="number" min="0" max="100"
              value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <div className="form-label">Предоплата ₽</div>
            <input className="form-input" type="number" min="0"
              value={prepayment} onChange={e => setPrepayment(e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* DELIVERY */}
        <div className="form-row-2">
          <div className="form-group">
            <div className="form-label">Доставка</div>
            <select className="form-select" value={delivery} onChange={e => setDelivery(e.target.value)}>
              <option>Самовывоз</option>
              <option>Яндекс доставка</option>
            </select>
          </div>
          {delivery !== 'Самовывоз' && (
            <div className="form-group">
              <div className="form-label">Адрес</div>
              <input className="form-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Улица, дом" />
            </div>
          )}
        </div>

        {/* NOTES */}
        <div className="form-group">
          <div className="form-label">Заметка к заказу</div>
          <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Любые детали..." />
        </div>

        {/* TOTAL */}
        <div className="total-box">
          <div>
            <div className="total-label">Итого <span className="total-days">{days} сут.</span></div>
            <div className="total-rest" style={{color: rest > 0 ? 'var(--amber)' : 'var(--green)'}}>
              {rest > 0 ? `Остаток: ${rest.toLocaleString('ru-RU')} ₽` : '✓ Оплачено полностью'}
            </div>
          </div>
          <div className="total-amount">{total.toLocaleString('ru-RU')} ₽</div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || hasConflict()}>
            {saving ? 'Сохранение...' : hasConflict() ? '⚠ Конфликт дат' : 'Сохранить заказ'}
          </button>
        </div>
      </div>
    </div>
  )
}
