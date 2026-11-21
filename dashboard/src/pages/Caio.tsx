import { useEffect, useMemo, useState } from 'react';
import { Bot, Database, FileText, Loader2, Search, ShieldCheck } from 'lucide-react';
import './Caio.css';

interface Company {
  id: string;
  name: string;
  role: string;
  active?: boolean;
}

interface SearchResult {
  title: string;
  content: string;
  score: number;
}

interface KnowledgeSource {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  chunks: number;
  updatedAt: number;
}

const jsonRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Erro ${response.status}`);
  return body as T;
};

export function Caio() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedCompany = useMemo(() => companies.find(company => company.id === companyId), [companies, companyId]);

  const loadCompanies = async () => {
    const data = await jsonRequest<Company[]>('/companies');
    setCompanies(data);
    setCompanyId(current => current || data.find(company => company.active)?.id || data[0]?.id || '');
  };

  const loadSources = async (id: string) => {
    if (!id) return;
    setSources(await jsonRequest<KnowledgeSource[]>(`/companies/${id}/knowledge`));
  };

  useEffect(() => {
    void loadCompanies().catch(errorValue => setError(errorValue instanceof Error ? errorValue.message : 'Não foi possível carregar as empresas.'));
  }, []);

  useEffect(() => {
    void loadSources(companyId).catch(errorValue => setError(errorValue instanceof Error ? errorValue.message : 'Não foi possível carregar o RAG.'));
  }, [companyId]);

  const saveSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyId || !title.trim() || !content.trim()) return;
    setBusy(true);
    setError('');
    try {
      await jsonRequest(`/companies/${companyId}/knowledge`, { method: 'POST', body: JSON.stringify({ title, content }) });
      setTitle('');
      setContent('');
      await loadSources(companyId);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Não foi possível salvar a fonte.');
    } finally {
      setBusy(false);
    }
  };

  const searchKnowledge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyId || !query.trim()) return;
    setBusy(true);
    setError('');
    try {
      setResults(await jsonRequest<SearchResult[]>(`/companies/${companyId}/knowledge/search`, { method: 'POST', body: JSON.stringify({ query, limit: 5 }) }));
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : 'Não foi possível pesquisar a base.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="caio-page">
      <header className="caio-header">
        <div>
          <div className="caio-eyebrow"><Bot size={16} /> Inteligência comercial</div>
          <h1>CAIO</h1>
          <p>Configure o contexto de cada empresa antes de ativar respostas automáticas.</p>
        </div>
        <label className="caio-company-picker">
          <span>Empresa ativa</span>
          <select value={companyId} onChange={event => setCompanyId(event.target.value)}>
            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
      </header>

      {error && <div className="caio-error">{error}</div>}

      <section className="caio-cards" aria-label="Status do CAIO">
        <article><ShieldCheck size={20} /><div><strong>Isolamento por empresa</strong><span>{selectedCompany?.name || 'Selecione uma empresa'}</span></div></article>
        <article><Database size={20} /><div><strong>{sources.length} fontes RAG</strong><span>Base exclusiva deste tenant</span></div></article>
        <article><Bot size={20} /><div><strong>Modo rascunho</strong><span>Sem envio automático ao WhatsApp</span></div></article>
      </section>

      <section className="caio-grid">
        <form className="caio-panel" onSubmit={saveSource}>
          <div className="caio-panel-heading"><FileText size={18} /><div><h2>Adicionar informação</h2><p>Cadastre produtos, preços, regras e informações da empresa.</p></div></div>
          <label>Título<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: Sobre a Orizon Tech" maxLength={240} /></label>
          <label>Conteúdo<textarea value={content} onChange={event => setContent(event.target.value)} placeholder="Cole aqui as informações aprovadas da empresa..." rows={9} maxLength={8000} /></label>
          <button type="submit" disabled={busy || !companyId || !title.trim() || !content.trim()}>{busy ? <Loader2 className="caio-spin" size={16} /> : null}Salvar na base da empresa</button>
        </form>

        <div className="caio-panel">
          <div className="caio-panel-heading"><Search size={18} /><div><h2>Testar conhecimento</h2><p>Confira quais trechos o CAIO usará no atendimento.</p></div></div>
          <form className="caio-search" onSubmit={searchKnowledge}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: quais serviços oferecemos?" /><button aria-label="Pesquisar" type="submit" disabled={busy || !query.trim()}><Search size={17} /></button></form>
          <div className="caio-results">{results.length === 0 ? <p className="caio-empty">Faça uma pergunta para consultar a base.</p> : results.map(result => <article key={`${result.title}-${result.content}`}><div><strong>{result.title}</strong><span>{Math.round(result.score * 100)}% de relevância</span></div><p>{result.content}</p></article>)}</div>
        </div>
      </section>

      <section className="caio-panel caio-sources"><div className="caio-panel-heading"><Database size={18} /><div><h2>Fontes cadastradas</h2><p>Estas informações pertencem somente à empresa selecionada.</p></div></div>{sources.length === 0 ? <p className="caio-empty">Nenhuma fonte cadastrada.</p> : <div className="caio-source-list">{sources.map(source => <div key={source.id}><FileText size={16} /><span>{source.title}</span><small>{source.chunks} trechos · {source.status}</small></div>)}</div>}</section>
    </main>
  );
}

