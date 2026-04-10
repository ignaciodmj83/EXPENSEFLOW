import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  FirebaseUser,
  OperationType,
  handleFirestoreError
} from './firebase';
import { extractTicketData, extractOdometerData, ExtractedTicketData } from './lib/gemini';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  LayoutDashboard, 
  Plus, 
  Receipt, 
  LogOut, 
  Camera, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search,
  FileText,
  Loader2,
  ChevronRight,
  Send,
  Settings,
  Mail,
  Map,
  Navigation,
  Fuel,
  TrendingUp,
  Users,
  ShieldCheck,
  ArrowRightLeft
} from 'lucide-react';
import { format } from 'date-fns';

// --- Types ---

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'employee' | 'admin';
  defaultEmailHigh?: string;
  defaultEmailLow?: string;
  kmPrice?: number;
  createdAt: Timestamp;
}

interface Ticket {
  id: string;
  userId: string;
  merchantName: string;
  date: string;
  totalAmount: number;
  currency: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  imageUrl?: string;
  emailSent?: boolean;
  createdAt: Timestamp;
}

interface Trip {
  id: string;
  userId: string;
  date: string;
  startOdometer: number;
  endOdometer: number;
  distance: number;
  totalReimbursement: number;
  kmPrice: number;
  startImageUrl?: string;
  endImageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
}

// --- Components ---

const Auth = () => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorDetails(null);
    try {
      console.log('Starting Google Login...');
      // Use signInWithPopup - this is preferred in AI Studio
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      console.log('Login successful:', user.email);
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log('Creating new user profile...');
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'User',
          role: 'employee',
          defaultEmailHigh: 'admin-high@company.com',
          defaultEmailLow: 'admin-low@company.com',
          kmPrice: 0.19,
          createdAt: Timestamp.now()
        });
        console.log('Profile created successfully');
      }
      toast.success('Sesión iniciada correctamente');
    } catch (error: any) {
      console.error('Login error full object:', error);
      let message = 'Error al iniciar sesión';
      
      if (error.code === 'auth/popup-blocked') {
        message = 'El navegador bloqueó la ventana emergente. Por favor, permite los popups.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        message = 'Se canceló la solicitud de inicio de sesión.';
      } else if (error.code === 'auth/unauthorized-domain') {
        message = 'Este dominio no está autorizado en Firebase. Prueba abriendo la app en una pestaña nueva.';
      } else {
        message = error.message || 'Error desconocido';
      }
      
      setErrorDetails(message);
      toast.error(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl bg-white">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Receipt className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">ExpenseFlow</CardTitle>
            <CardDescription className="text-base">Gestión inteligente de gastos para tu empresa</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            type="button"
            onClick={handleLogin} 
            className="w-full h-12 text-base font-medium" 
            size="lg" 
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              'Iniciar sesión con Google'
            )}
          </Button>
          
          {errorDetails && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm text-center">
              {errorDetails}
              <div className="mt-2">
                <p className="text-xs opacity-80">Si el problema persiste, intenta abrir la aplicación en una pestaña nueva usando el icono de la flecha en la esquina superior derecha.</p>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground px-8">
            Al continuar, aceptas nuestros términos de servicio y política de privacidad.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const TicketForm = ({ onComplete }: { onComplete: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [data, setData] = useState<Partial<ExtractedTicketData>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      
      // Resize image before storing and processing
      try {
        const resizedBase64 = await resizeImage(base64, 800, 800);
        setImage(resizedBase64);
        await processImage(resizedBase64);
      } catch (error) {
        console.error('Error resizing image:', error);
        setImage(base64); // Fallback to original if resize fails
        await processImage(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const resizeImage = (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to JPEG with 0.7 quality
      };
      img.onerror = reject;
    });
  };

  const processImage = async (base64: string) => {
    setLoading(true);
    try {
      const extracted = await extractTicketData(base64);
      setData(extracted);
      toast.success('Datos extraídos correctamente');
    } catch (error) {
      console.error(error);
      toast.error('Error al procesar la imagen');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.merchantName || !data.totalAmount) {
      toast.error('Por favor completa los campos obligatorios');
      return;
    }

    if (!auth.currentUser) {
      toast.error('Debes estar autenticado para guardar un ticket');
      return;
    }

    const amount = Number(data.totalAmount);
    if (isNaN(amount)) {
      toast.error('El importe debe ser un número válido');
      return;
    }

    setLoading(true);
    try {
      const path = 'tickets';
      if (image) {
        console.log('Image size (base64):', Math.round(image.length / 1024), 'KB');
      }
      
      const ticketData = {
        userId: auth.currentUser.uid,
        merchantName: data.merchantName.substring(0, 190), // Ensure it stays under the 200 limit
        date: data.date || format(new Date(), 'yyyy-MM-dd'),
        totalAmount: amount,
        currency: data.currency || 'EUR',
        category: data.category || 'General',
        status: 'pending',
        imageUrl: image || '',
        createdAt: Timestamp.now()
      };
      
      console.log('Attempting to save ticket to Firestore...', ticketData);
      const docRef = await addDoc(collection(db, path), ticketData);
      console.log('Ticket saved successfully with ID:', docRef.id);
      
      toast.success('Ticket guardado correctamente');
      onComplete();
    } catch (error: any) {
      console.error('CRITICAL ERROR saving ticket:', error);
      
      let errorMessage = 'Error al guardar el ticket';
      if (error.message?.includes('quota')) {
        errorMessage = 'Cuota de base de datos excedida. Inténtalo mañana.';
      } else if (error.message?.includes('permission-denied')) {
        errorMessage = 'Error de permisos en la base de datos.';
      } else if (error.message?.includes('too large')) {
        errorMessage = 'La imagen es demasiado grande para guardarla.';
      } else {
        errorMessage = `Error: ${error.message || 'Desconocido'}`;
      }
      
      toast.error(errorMessage);
      // Still call the handler for system logging
      try {
        handleFirestoreError(error, OperationType.CREATE, 'tickets');
      } catch (e) {
        // Ignore re-thrown error from handler
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors">
            {image ? (
              <img src={image} alt="Ticket" className="w-full h-full object-contain rounded-lg p-2" />
            ) : (
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Camera className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground font-medium">Sube una foto o haz un ticket</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG hasta 10MB</p>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} ref={fileInputRef} />
          </label>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-primary animate-pulse py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Procesando con IA...</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="merchant">Establecimiento *</Label>
            <Input 
              id="merchant" 
              value={data.merchantName || ''} 
              onChange={(e) => setData({...data, merchantName: e.target.value})}
              placeholder="Ej: Mercadona, Uber..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Importe Total *</Label>
            <Input 
              id="amount" 
              type="number" 
              step="0.01"
              value={data.totalAmount || ''} 
              onChange={(e) => setData({...data, totalAmount: Number(e.target.value)})}
              placeholder="0.00"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Fecha</Label>
            <Input 
              id="date" 
              type="date"
              value={data.date || ''} 
              onChange={(e) => setData({...data, date: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Categoría</Label>
            <Input 
              id="category" 
              value={data.category || ''} 
              onChange={(e) => setData({...data, category: e.target.value})}
              placeholder="Ej: Comida, Viaje..."
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar Ticket'}
        </Button>
      </DialogFooter>
    </form>
  );
};

const TripForm = ({ onComplete, kmPrice }: { onComplete: () => void, kmPrice: number }) => {
  const [loading, setLoading] = useState(false);
  const [startImage, setStartImage] = useState<string | null>(null);
  const [endImage, setEndImage] = useState<string | null>(null);
  const [data, setData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startOdometer: 0,
    endOdometer: 0
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const resized = await resizeImage(base64, 800, 800);
        if (type === 'start') setStartImage(resized);
        else setEndImage(resized);
        
        toast.info('Analizando imagen con IA...');
        const extracted = await extractOdometerData(resized);
        if (extracted.odometerValue) {
          setData(prev => ({
            ...prev,
            [type === 'start' ? 'startOdometer' : 'endOdometer']: extracted.odometerValue
          }));
          toast.success(`Kilometraje extraído: ${extracted.odometerValue} km`);
        }
      } catch (error) {
        console.error(error);
        toast.error('No se pudo extraer el kilometraje automáticamente');
      }
    };
    reader.readAsDataURL(file);
  };

  const resizeImage = (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
        } else {
          if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const distance = data.endOdometer - data.startOdometer;
    if (distance <= 0) {
      toast.error('El kilometraje final debe ser mayor al inicial');
      return;
    }

    setLoading(true);
    try {
      console.log('Saving trip data...', data);
      const tripData = {
        userId: auth.currentUser?.uid,
        date: data.date,
        startOdometer: Number(data.startOdometer),
        endOdometer: Number(data.endOdometer),
        distance: Number(distance),
        kmPrice: Number(kmPrice),
        totalReimbursement: Number(distance * kmPrice),
        startImageUrl: startImage || '',
        endImageUrl: endImage || '',
        status: 'pending',
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db, 'trips'), tripData);
      toast.success('Viaje registrado correctamente');
      onComplete();
    } catch (error) {
      console.error('Error saving trip:', error);
      handleFirestoreError(error, OperationType.CREATE, 'trips');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Odómetro Inicial</Label>
          <div className="flex flex-col gap-2">
            <label className="h-32 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer bg-muted/30 overflow-hidden">
              {startImage ? <img src={startImage} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'start')} />
            </label>
            <Input type="number" value={data.startOdometer} onChange={(e) => setData({...data, startOdometer: Number(e.target.value)})} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Odómetro Final</Label>
          <div className="flex flex-col gap-2">
            <label className="h-32 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer bg-muted/30 overflow-hidden">
              {endImage ? <img src={endImage} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'end')} />
            </label>
            <Input type="number" value={data.endOdometer} onChange={(e) => setData({...data, endOdometer: Number(e.target.value)})} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Fecha</Label>
        <Input type="date" value={data.date} onChange={(e) => setData({...data, date: e.target.value})} />
      </div>
      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Distancia:</span>
          <span className="font-mono font-bold">{Math.max(0, data.endOdometer - data.startOdometer)} km</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-muted-foreground">Reembolso ({kmPrice}€/km):</span>
          <span className="font-mono font-bold text-primary">{(Math.max(0, data.endOdometer - data.startOdometer) * kmPrice).toFixed(2)}€</span>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar Viaje'}
      </Button>
    </form>
  );
};

const Dashboard = ({ userProfile }: { userProfile: UserProfile }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTripDialogOpen, setIsTripDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    defaultEmailHigh: userProfile.defaultEmailHigh || '',
    defaultEmailLow: userProfile.defaultEmailLow || '',
    kmPrice: userProfile.kmPrice || 0.19
  });
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tickets' | 'trips'>('tickets');

  useEffect(() => {
    const tPath = 'tickets';
    const trPath = 'trips';
    
    const tQ = userProfile.role === 'admin' 
      ? query(collection(db, tPath), orderBy('createdAt', 'desc'))
      : query(collection(db, tPath), where('userId', '==', userProfile.uid), orderBy('createdAt', 'desc'));

    const trQ = userProfile.role === 'admin'
      ? query(collection(db, trPath), orderBy('createdAt', 'desc'))
      : query(collection(db, trPath), where('userId', '==', userProfile.uid), orderBy('createdAt', 'desc'));

    const unsubTickets = onSnapshot(tQ, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
    });

    const unsubTrips = onSnapshot(trQ, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
      setLoading(false);
    });

    return () => { unsubTickets(); unsubTrips(); };
  }, [userProfile]);

  const handleStatusChange = async (id: string, type: 'tickets' | 'trips', status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, type, id), { status });
      toast.success(`${type === 'tickets' ? 'Ticket' : 'Viaje'} ${status === 'approved' ? 'aprobado' : 'rechazado'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, type);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateDoc(doc(db, 'users', userProfile.uid), settings);
      toast.success('Configuración actualizada');
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleSendTicket = (ticket: Ticket) => {
    const emailTo = ticket.totalAmount > 50 
      ? (settings.defaultEmailHigh || userProfile.email)
      : (settings.defaultEmailLow || userProfile.email);
    
    const subject = `[GASTO] ${ticket.merchantName} - ${ticket.totalAmount}${ticket.currency}`;
    const body = `Detalles del gasto:\n\nEstablecimiento: ${ticket.merchantName}\nFecha: ${ticket.date}\nImporte: ${ticket.totalAmount} ${ticket.currency}\nCategoría: ${ticket.category}\nEstado: ${ticket.status}\n\nEnviado desde ExpenseFlow Tech`;
    
    window.open(`mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    toast.info(`Enviando a ${emailTo}`);
  };

  const chartData = React.useMemo(() => {
    const months: Record<string, number> = {};
    tickets.forEach(t => {
      if (t.status === 'approved') {
        const month = t.date.substring(0, 7);
        months[month] = (months[month] || 0) + t.totalAmount;
      }
    });
    trips.forEach(t => {
      if (t.status === 'approved') {
        const month = t.date.substring(0, 7);
        months[month] = (months[month] || 0) + t.totalReimbursement;
      }
    });
    return Object.entries(months).map(([name, total]) => ({ name, total })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets, trips]);

  const filteredTickets = tickets.filter(t => !selectedMonth || t.date.startsWith(selectedMonth));
  const filteredTrips = trips.filter(t => !selectedMonth || t.date.startsWith(selectedMonth));

  const totalApproved = tickets.reduce((acc, t) => acc + (t.status === 'approved' ? t.totalAmount : 0), 0) + 
                        trips.reduce((acc, t) => acc + (t.status === 'approved' ? t.totalReimbursement : 0), 0);

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="glass-card sticky top-0 z-50 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-xl rotate-3 hover:rotate-0 transition-transform">
              <ShieldCheck className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">ExpenseFlow</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-black/40">Panel de Control</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-xs font-medium">{userProfile.displayName}</p>
              <Badge variant="secondary" className="text-[9px] uppercase tracking-widest h-5">{userProfile.role === 'admin' ? 'Administrador' : 'Empleado'}</Badge>
            </div>
            
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger render={(props) => (
                <Button variant="ghost" size="icon" {...props} className="rounded-full hover:bg-black/5">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                </Button>
              )} />
              <DialogContent className="glass-card border-none sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold tracking-tight">Configuración del Sistema</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">Configura el enrutamiento y parámetros generales</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-4">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrutamiento de Email</Label>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-medium">Prioridad Alta (&gt;50€)</Label>
                      <Input value={settings.defaultEmailHigh} onChange={(e) => setSettings({...settings, defaultEmailHigh: e.target.value})} placeholder="admin-high@empresa.com" className="text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-medium">Prioridad Estándar (&lt;=50€)</Label>
                      <Input value={settings.defaultEmailLow} onChange={(e) => setSettings({...settings, defaultEmailLow: e.target.value})} placeholder="admin-low@empresa.com" className="text-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tarifa de Kilometraje (€/km)</Label>
                    <Input type="number" step="0.01" value={settings.kmPrice} onChange={(e) => setSettings({...settings, kmPrice: Number(e.target.value)})} className="text-sm" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveSettings} className="w-full bg-accent text-white hover:bg-accent/90 font-medium h-11 rounded-xl">Actualizar Sistema</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="icon" onClick={() => signOut(auth)} className="rounded-full hover:bg-rose-50 hover:text-rose-600">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-2 tech-border bg-white p-8 shadow-sm border-black/[0.03]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Análisis Agregado</h3>
                <p className="text-2xl font-semibold tracking-tight">Flujo de Caja Aprobado</p>
              </div>
              {selectedMonth && <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)} className="text-[10px] uppercase font-bold">Restablecer</Button>}
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} onClick={(data: any) => data?.activePayload && setSelectedMonth(data.activePayload[0].payload.name)}>
                  <XAxis dataKey="name" hide />
                  <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px'}} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === selectedMonth ? '#007AFF' : '#E5E5EA'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="tech-border bg-white p-6 shadow-sm border-black/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Total Aprobado</p>
              <p className="text-3xl font-semibold tracking-tight">{totalApproved.toFixed(2)}€</p>
            </Card>
            <Card className="tech-border bg-white p-6 shadow-sm border-black/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tareas Pendientes</p>
              <p className="text-3xl font-semibold tracking-tight">{tickets.filter(t => t.status === 'pending').length + trips.filter(t => t.status === 'pending').length}</p>
            </Card>
          </div>

          <div className="space-y-4">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger render={(props) => (
                <Button {...props} className="w-full h-16 bg-accent text-white rounded-2xl font-semibold hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all">
                  <Receipt className="mr-2 w-5 h-5" />
                  Nuevo Ticket
                </Button>
              )} />
              <DialogContent className="sm:max-w-[500px] glass-card border-none">
                <DialogHeader><DialogTitle className="text-xl font-semibold tracking-tight">Escanear Recibo</DialogTitle></DialogHeader>
                <TicketForm onComplete={() => setIsDialogOpen(false)} />
              </DialogContent>
            </Dialog>

            <Dialog open={isTripDialogOpen} onOpenChange={setIsTripDialogOpen}>
              <DialogTrigger render={(props) => (
                <Button {...props} className="w-full h-16 bg-white text-black border border-black/10 rounded-2xl font-semibold hover:bg-black/5 transition-all shadow-sm">
                  <Navigation className="mr-2 w-5 h-5" />
                  Nuevo Viaje
                </Button>
              )} />
              <DialogContent className="sm:max-w-[500px] glass-card border-none">
                <DialogHeader><DialogTitle className="text-xl font-semibold tracking-tight">Registrar Kilometraje</DialogTitle></DialogHeader>
                <TripForm onComplete={() => setIsTripDialogOpen(false)} kmPrice={settings.kmPrice} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Main Content Tabs */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-black/5 pb-0">
            <button onClick={() => setActiveTab('tickets')} className={`pb-4 px-4 text-sm font-medium transition-all relative ${activeTab === 'tickets' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
              Tickets
              {activeTab === 'tickets' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
            <button onClick={() => setActiveTab('trips')} className={`pb-4 px-4 text-sm font-medium transition-all relative ${activeTab === 'trips' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
              Viajes
              {activeTab === 'trips' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          </div>

          <Card className="tech-border bg-white overflow-hidden shadow-sm border-black/[0.03]">
            <ScrollArea className="h-[600px]">
              {activeTab === 'tickets' ? (
                <Table>
                  <TableHeader className="bg-black/[0.02]">
                    <TableRow>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-8">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Establecimiento</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Valor</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Estado</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-8">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id} className="hover:bg-black/[0.01] transition-colors">
                        <TableCell className="pl-8 text-xs text-muted-foreground">{ticket.date}</TableCell>
                        <TableCell className="font-medium text-sm">{ticket.merchantName}</TableCell>
                        <TableCell className="text-right font-semibold">{ticket.totalAmount.toFixed(2)} {ticket.currency}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={`text-[9px] uppercase tracking-widest ${ticket.status === 'approved' ? 'bg-success/10 text-success border-success/20' : ticket.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-black/5 text-black border-black/10'}`}>{ticket.status === 'approved' ? 'Aprobado' : ticket.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-black/5" onClick={() => handleSendTicket(ticket)}><Send className="w-3.5 h-3.5" /></Button>
                            {userProfile.role === 'admin' && ticket.status === 'pending' && (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-success rounded-full hover:bg-success/10" onClick={() => handleStatusChange(ticket.id, 'tickets', 'approved')}><CheckCircle2 className="w-4 h-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500 rounded-full hover:bg-rose-50" onClick={() => handleStatusChange(ticket.id, 'tickets', 'rejected')}><XCircle className="w-4 h-4" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader className="bg-black/[0.02]">
                    <TableRow>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-8">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distancia</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Reembolso</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Estado</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-8">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.map((trip) => (
                      <TableRow key={trip.id} className="hover:bg-black/[0.01] transition-colors">
                        <TableCell className="pl-8 text-xs text-muted-foreground">{trip.date}</TableCell>
                        <TableCell className="font-medium text-sm">{trip.distance} KM</TableCell>
                        <TableCell className="text-right font-semibold">{trip.totalReimbursement.toFixed(2)}€</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={`text-[9px] uppercase tracking-widest ${trip.status === 'approved' ? 'bg-success/10 text-success border-success/20' : trip.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-black/5 text-black border-black/10'}`}>{trip.status === 'approved' ? 'Aprobado' : trip.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex items-center justify-end gap-1">
                            {userProfile.role === 'admin' && trip.status === 'pending' && (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-success rounded-full hover:bg-success/10" onClick={() => handleStatusChange(trip.id, 'trips', 'approved')}><CheckCircle2 className="w-4 h-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500 rounded-full hover:bg-rose-50" onClick={() => handleStatusChange(trip.id, 'trips', 'rejected')}><XCircle className="w-4 h-4" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Setting up auth listener...');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? firebaseUser.email : 'No user');
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            console.log('Profile found:', profileDoc.data());
            setProfile(profileDoc.data() as UserProfile);
          } else {
            console.log('No profile found for user:', firebaseUser.uid);
            // If user is logged in but no profile exists, the Auth component will handle creation
            // but we need to make sure we don't get stuck in loading
            setProfile(null);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans antialiased">
      {user && profile ? (
        <Dashboard userProfile={profile} />
      ) : (
        <Auth />
      )}
      <Toaster position="top-right" />
    </div>
  );
}
