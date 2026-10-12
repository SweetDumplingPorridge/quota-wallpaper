export function previousAccount(accounts,id){return accounts.find(a=>a.id===id||a.sourceIds?.includes(id))}
export function remapEvents(events,owners,legacy){return events.map(e=>({...e,accountId:(e.sourceId&&owners[e.sourceId])||legacy[e.accountId]||e.accountId}))}
