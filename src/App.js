import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Upload,
  Search,
  LogOut,
  FileText,
  X,
  Plus,
  Eye,
  AlertCircle,
  Trash2,
} from "lucide-react";

// Configuração do Supabase
const SUPABASE_URL = "https://jprqauwgyvtqxmzwvuns.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwcnFhdXdneXZ0cXhtend2dW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMjMyNTQsImV4cCI6MjA4MDc5OTI1NH0.m0A3vpd1NkajaDEDls9JP9PTr0zpPpvgHcBhWj_7BDM";

// Cliente Supabase
const supabase = (() => {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const getToken = () => localStorage.getItem("sb_token") || SUPABASE_ANON_KEY;

  return {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ email, password }),
          }
        );
        const data = await res.json();

        console.log("📡 Resposta do login:", data);

        if (data.access_token) {
          localStorage.setItem("sb_token", data.access_token);
          localStorage.setItem("sb_user", JSON.stringify(data.user));
          console.log("💾 Token salvo no localStorage");
          return { data, error: null };
        }
        return { data: null, error: data };
      },
      signUp: async ({ email, password }) => {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        return { data, error: data.error || null };
      },
      signOut: async () => {
        localStorage.removeItem("sb_token");
        localStorage.removeItem("sb_user");
      },
      getUser: () => {
        const user = localStorage.getItem("sb_user");
        return user ? JSON.parse(user) : null;
      },
    },
    from: (table) => ({
      select: (columns = "*") => {
        const token = getToken();
        return {
          eq: async (column, value) => {
            const url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}&${column}=eq.${value}`;
            const res = await fetch(url, {
              headers: { ...headers, Authorization: `Bearer ${token}` },
            });

            // Se não autorizado, retornar erro
            if (res.status === 401) {
              return {
                data: [],
                error: { message: "401 Unauthorized - Token expirado" },
              };
            }

            const data = await res.json();
            return { data: Array.isArray(data) ? data : [], error: null };
          },
        };
      },
      insert: async (values) => {
        const token = getToken();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: "POST",
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
            Prefer: "return=representation",
          },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        return { data, error: null };
      },
      delete: () => ({
        eq: async (column, value) => {
          const token = getToken();
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`,
            {
              method: "DELETE",
              headers: { ...headers, Authorization: `Bearer ${token}` },
            }
          );
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket) => ({
        upload: async (path, file) => {
          const token = getToken();
          const res = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: file,
            }
          );
          const data = await res.json();
          return { data, error: data.error || null };
        },
        remove: async (paths) => {
          const token = getToken();
          const res = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${bucket}`,
            {
              method: "DELETE",
              headers: { ...headers, Authorization: `Bearer ${token}` },
              body: JSON.stringify({ prefixes: paths }),
            }
          );
          return { error: null };
        },
        getPublicUrl: (path) => ({
          data: {
            publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  };
})();

// Converter múltiplas imagens para um único PDF usando jsPDF
const imagesToPDF = async (files) => {
  const jsPDF = window.jspdf.jsPDF;
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let isFirstPage = true;

  for (const file of files) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = dataUrl;
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
    const width = img.width * ratio;
    const height = img.height * ratio;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;

    if (!isFirstPage) pdf.addPage();
    isFirstPage = false;
    pdf.addImage(dataUrl, "JPEG", x, y, width, height);
  }

  const pdfBlob = pdf.output("blob");
  return new File([pdfBlob], `documento_${Date.now()}.pdf`, {
    type: "application/pdf",
  });
};

const App = () => {
  const [showListModal, setShowListModal] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [numeroQuadra, setNumeroQuadra] = useState("");
  const [infoAdicional, setInfoAdicional] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [quadras, setQuadras] = useState([]);
  const [allQuadras, setAllQuadras] = useState([]);
  const [isPdfFullScreen, setIsPdfFullScreen] = useState(false);
  const [selectedQuadra, setSelectedQuadra] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [existingQuadra, setExistingQuadra] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.async = true;
    document.body.appendChild(script);

    const savedUser = supabase.auth.getUser();
    if (savedUser) {
      setUser(savedUser);
      setView("search");
    }

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      // Limpar tokens antigos antes de fazer login
      localStorage.removeItem("sb_token");
      localStorage.removeItem("sb_user");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data || !data.user) {
        throw new Error("Email ou senha incorretos");
      }

      console.log("✅ Login bem-sucedido");
      console.log(
        "🔑 Novo token:",
        data.access_token?.substring(0, 20) + "..."
      );

      setUser(data.user);
      setView("search");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert("✅ Cadastro realizado! Verifique seu email para confirmar.");
      setView("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    setUser(null);
    setView("login");
    setEmail("");
    setPassword("");
    setQuadras([]);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);

    for (const file of files) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [
          ...prev,
          { name: file.name, url: reader.result },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const checkExistingQuadra = async (numero) => {
    const { data } = await supabase
      .from("quadras")
      .select("*")
      .eq("numero_quadra", numero);
    return data && data.length > 0 ? data[0] : null;
  };

  const handleUpload = async (overwrite = false) => {
    if (!selectedFiles.length || !numeroQuadra) {
      setError(
        "⚠️ Preencha o número da quadra e selecione pelo menos um arquivo"
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const existing = await checkExistingQuadra(numeroQuadra);

      if (existing && !overwrite) {
        setExistingQuadra(existing);
        setShowOverwriteModal(true);
        setLoading(false);
        return;
      }

      if (existing && overwrite) {
        const oldFiles = JSON.parse(existing.arquivo_url || "[]");
        if (oldFiles.length > 0) {
          await supabase.storage.from("quadras").remove(oldFiles);
        }
        await supabase.from("quadras").delete().eq("id", existing.id);
      }

      const pdfFile = await imagesToPDF(selectedFiles);
      const fileName = `quadra_${numeroQuadra}_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("quadras")
        .upload(fileName, pdfFile);

      if (uploadError) throw uploadError;

      const insertData = {
        numero_quadra: numeroQuadra,
        info_adicional: infoAdicional,
        arquivo_url: JSON.stringify([fileName]),
        user_id: user.id,
      };

      const { error: insertError } = await supabase
        .from("quadras")
        .insert([insertData]);

      if (insertError) {
        throw new Error(
          `Erro ao salvar na tabela: ${
            insertError.message || JSON.stringify(insertError)
          }`
        );
      }

      alert("✅ Upload realizado com sucesso!");
      setNumeroQuadra("");
      setInfoAdicional("");
      setSelectedFiles([]);
      setPreviews([]);
      setShowOverwriteModal(false);
      setView("search");
    } catch (err) {
      setError(`❌ Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("⚠️ Digite o número da quadra");
      return;
    }

    setLoading(true);
    setError("");
    setQuadras([]);

    try {
      console.log("🔍 Buscando quadra:", searchQuery.trim());
      console.log(
        "🔑 Token atual (primeiros 30 chars):",
        localStorage.getItem("sb_token")?.substring(0, 30) + "..."
      );

      const { data, error } = await supabase
        .from("quadras")
        .select("*")
        .eq("numero_quadra", searchQuery.trim());

      console.log("📦 Resultado da busca:", data);
      console.log("❌ Erro (se houver):", error);

      if (error) {
        // Se for erro de autenticação
        if (
          error.message &&
          (error.message.includes("401") ||
            error.message.includes("Unauthorized"))
        ) {
          alert("⚠️ Sessão expirada. Faça login novamente.");
          handleLogout();
          return;
        }
        throw new Error(error.message || "Erro ao buscar");
      }

      if (!data || data.length === 0) {
        setError("🔍 Nenhuma quadra encontrada com este número");
        setQuadras([]);
      } else {
        console.log("✅ Quadras encontradas:", data.length);
        setQuadras(data);
      }
    } catch (err) {
      console.error("❌ Erro na busca:", err);
      // Se for erro de autenticação, fazer logout
      if (err.message.includes("401") || err.message.includes("Unauthorized")) {
        alert("⚠️ Sessão expirada. Faça login novamente.");
        handleLogout();
        return;
      }
      setError(`❌ Erro na busca: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (quadra) => {
    setSelectedQuadra(quadra);
    setShowModal(true);
  };

  // --- Lista todas as quadras via REST ---
  const fetchAllQuadras = async () => {
    try {
      const token = localStorage.getItem("sb_token");

      const res = await fetch(`${SUPABASE_URL}/rest/v1/quadras?select=*`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (Array.isArray(data)) {
        setAllQuadras(data);
        setShowListModal(true);
      } else {
        setError("Erro ao carregar lista.");
      }
    } catch (err) {
      console.error(err);
      setError("Falha ao buscar quadras.");
    }
  };

  const openListModal = async () => {
    setError("");
    try {
      const all = await fetchAllQuadras();
      setAllQuadras(all);
      setView("list");
    } catch (err) {
      console.error("Erro carregando lista de quadras:", err);
      setError("Erro ao carregar a lista de quadras.");
    }
  };

  const downloadPdf = async (fileName) => {
    try {
      const token = localStorage.getItem("sb_token") || SUPABASE_ANON_KEY;
      const url = `${SUPABASE_URL}/storage/v1/object/public/quadras/${fileName}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao baixar o arquivo");
      const blob = await res.blob();
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("downloadPdf erro:", err);
      setError("Falha ao baixar o arquivo.");
    }
  };

  const togglePdfFullScreen = () => {
    setIsPdfFullScreen((prev) => !prev);
  };

  const handleKeyPress = (e, action) => {
    if (e.key === "Enter") action();
  };
  if (isPdfFullScreen && selectedQuadra) {
    const fileName = JSON.parse(selectedQuadra.arquivo_url)[0];
    const pdfUrl = `${SUPABASE_URL}/storage/v1/object/public/quadras/${fileName}`;

    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        {/* Top bar */}
        <div className="p-4 bg-black/60 flex justify-between items-center">
          <h2 className="text-white text-lg font-semibold">
            Quadra {selectedQuadra.numero_quadra}
          </h2>

          <div className="flex gap-3">
            {/* Botão informações adicionais */}
            {selectedQuadra.info_adicional && (
              <button
                onClick={() => setShowInfoPopup(!showInfoPopup)}
                className="text-white bg-white/20 px-3 py-2 rounded-lg hover:bg-white/30 transition flex items-center gap-2"
              >
                💬 Info
              </button>
            )}

            {/* Sair */}
            <button
              onClick={() => setIsPdfFullScreen(false)}
              className="text-white bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* PDF fullscreen */}
        <iframe src={pdfUrl} className="flex-1 w-full" />
        {showInfoPopup && (
          <div className="absolute top-20 right-6 bg-white shadow-2xl rounded-2xl p-5 border border-gray-200 max-w-sm animate-fade-in z-50">
            <h3 className="font-bold text-gray-800 mb-2">Informações</h3>
            <p className="text-gray-700 leading-relaxed">
              {selectedQuadra.info_adicional}
            </p>

            <button
              onClick={() => setShowInfoPopup(false)}
              className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
          <div className="text-center mb-8">
            <div className="inline-block p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4">
              <FileText className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Sistema de Quadras
            </h1>
            <p className="text-gray-600 mt-2">
              Gerencie seus documentos com facilidade
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) =>
                  handleKeyPress(
                    e,
                    view === "login" ? handleLogin : handleSignUp
                  )
                }
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) =>
                  handleKeyPress(
                    e,
                    view === "login" ? handleLogin : handleSignUp
                  )
                }
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg flex items-start gap-2">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button
              onClick={view === "login" ? handleLogin : handleSignUp}
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition shadow-lg hover:shadow-xl"
            >
              {loading
                ? "⏳ Carregando..."
                : view === "login"
                ? "🔐 Entrar"
                : "✨ Criar Conta"}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setView(view === "login" ? "signup" : "login");
                setError("");
              }}
              className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm transition"
            >
              {view === "login" ? "✨ Criar nova conta" : "🔐 Já tenho conta"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <FileText className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Gestão de Quadras
              </h1>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            <LogOut size={20} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <nav className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => {
              setView("search");
              setError("");
            }}
            className={`py-4 px-6 font-semibold transition ${
              view === "search"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Search className="inline mr-2" size={20} />
            Buscar
          </button>
          <button
            onClick={() => {
              setView("upload");
              setError("");
            }}
            className={`py-4 px-6 font-semibold transition ${
              view === "upload"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Plus className="inline mr-2" size={20} />
            Novo
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === "search" && (
          <div>
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg p-6 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">
                🔍 Buscar Quadra
              </h2>
              <button
                onClick={fetchAllQuadras}
                className="mt-3 mb-4 px-4 py-3 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 transition flex items-center gap-2"
              >
                📋
              </button>

              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleSearch)}
                  placeholder="Digite o número da quadra..."
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl transition"
                >
                  <Search size={20} />
                  Buscar
                </button>
              </div>
              {error && (
                <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 text-amber-700 p-4 rounded-lg flex items-start gap-2">
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>

            {quadras.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {quadras.map((quadra) => (
                  <div
                    key={quadra.id}
                    className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          Quadra {quadra.numero_quadra}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          📅{" "}
                          {new Date(quadra.created_at).toLocaleDateString(
                            "pt-BR"
                          )}
                        </p>
                      </div>
                      <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                        <FileText className="text-white" size={24} />
                      </div>
                    </div>
                    {quadra.info_adicional && (
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2 bg-gray-50 p-3 rounded-lg">
                        💬 {quadra.info_adicional}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        setSelectedQuadra(quadra);
                        setIsPdfFullScreen(true);
                      }}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 flex items-center justify-center gap-2 font-semibold shadow-lg hover:shadow-xl transition"
                    >
                      <Eye size={20} />
                      Visualizar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "upload" && (
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg p-8 max-w-3xl mx-auto border border-gray-200">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">
              ➕ Adicionar Nova Quadra
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Número da Quadra *
                </label>
                <input
                  type="text"
                  value={numeroQuadra}
                  onChange={(e) => setNumeroQuadra(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="Ex: 123"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Informações Adicionais
                </label>
                <textarea
                  value={infoAdicional}
                  onChange={(e) => setInfoAdicional(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="Adicione observações, localização, etc..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Arquivos * (múltiplos permitidos)
                </label>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 flex items-center justify-center gap-2 font-semibold shadow-lg hover:shadow-xl transition"
                  >
                    <Camera size={24} />
                    Câmera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white py-4 rounded-xl hover:from-blue-600 hover:to-cyan-700 flex items-center justify-center gap-2 font-semibold shadow-lg hover:shadow-xl transition"
                  >
                    <Upload size={24} />
                    Galeria
                  </button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {previews.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-700">
                    📎 Arquivos Selecionados ({previews.length}):
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {previews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={preview.url}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-48 object-cover rounded-xl border-2 border-gray-200"
                        />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                        <p className="text-xs text-gray-600 mt-2 truncate">
                          {preview.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg flex items-start gap-2">
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                onClick={() => handleUpload(false)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition"
              >
                {loading ? "⏳ Enviando..." : "💾 Salvar Quadra"}
              </button>
            </div>
          </div>
        )}
      </main>

      {showOverwriteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-amber-100 rounded-xl">
                <AlertCircle size={32} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  ⚠️ Quadra já existe!
                </h3>
                <p className="text-gray-600">
                  A quadra <strong>{numeroQuadra}</strong> já possui um
                  documento cadastrado.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleUpload(true)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-xl hover:from-red-600 hover:to-red-700 font-semibold disabled:opacity-50 transition shadow-lg"
              >
                🔄 Sobrescrever
              </button>
              <button
                onClick={() => {
                  setShowOverwriteModal(false);
                  setLoading(false);
                }}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl hover:bg-gray-200 font-semibold transition"
              >
                ❌ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {showListModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                📋 Lista de Quadras
              </h2>
              <button
                onClick={() => setShowListModal(false)}
                className="text-gray-600 hover:text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition"
              >
                ❌ Fechar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {allQuadras.map((quadra) => {
                const fileName = JSON.parse(quadra.arquivo_url)[0];
                const url = `${SUPABASE_URL}/storage/v1/object/public/quadras/${fileName}`;

                return (
                  <div
                    key={quadra.id}
                    className="border rounded-xl p-4 shadow hover:shadow-lg transition"
                  >
                    <h3 className="font-bold text-lg text-gray-800">
                      Quadra {quadra.numero_quadra}
                    </h3>

                    <p className="text-sm text-gray-500 mb-3">
                      {new Date(quadra.created_at).toLocaleDateString("pt-BR")}
                    </p>

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setSelectedQuadra(quadra);
                          setShowListModal(false);
                          setIsPdfFullScreen(true);
                        }}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        👁 Visualizar
                      </button>

                      <a
                        href={url}
                        download={`quadra_${quadra.numero_quadra}.pdf`}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        ⬇ Download
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
