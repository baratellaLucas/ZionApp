// Catálogo de ícones para Áreas de voluntariado — usado no seletor (Admin) e na renderização
// (Voluntários). A chave é o nome salvo em Area.icon; o valor é o componente lucide-react.
import {
  Briefcase, Coffee, Smile, Music, Users, Heart, Camera, Mic2, BookOpen,
  Utensils, Car, Shirt, Baby, Wrench, Palette, Video, Radio, Shield,
} from 'lucide-react';

export const AREA_ICON_CATALOG = [
  { key: 'Briefcase', Icon: Briefcase, label: 'Geral' },
  { key: 'Coffee', Icon: Coffee, label: 'Café' },
  { key: 'Smile', Icon: Smile, label: 'Recepção' },
  { key: 'Music', Icon: Music, label: 'Louvor' },
  { key: 'Mic2', Icon: Mic2, label: 'Palco' },
  { key: 'Users', Icon: Users, label: 'Equipe' },
  { key: 'Heart', Icon: Heart, label: 'Intercessão' },
  { key: 'Camera', Icon: Camera, label: 'Fotografia' },
  { key: 'Video', Icon: Video, label: 'Vídeo' },
  { key: 'Radio', Icon: Radio, label: 'Som' },
  { key: 'BookOpen', Icon: BookOpen, label: 'Ensino' },
  { key: 'Utensils', Icon: Utensils, label: 'Cozinha' },
  { key: 'Baby', Icon: Baby, label: 'Kids' },
  { key: 'Shirt', Icon: Shirt, label: 'Guarda-roupa' },
  { key: 'Car', Icon: Car, label: 'Estacionamento' },
  { key: 'Shield', Icon: Shield, label: 'Segurança' },
  { key: 'Wrench', Icon: Wrench, label: 'Manutenção' },
  { key: 'Palette', Icon: Palette, label: 'Criação' },
];

const ICON_MAP = Object.fromEntries(AREA_ICON_CATALOG.map(i => [i.key, i.Icon]));
export const getAreaIconComponent = (key) => ICON_MAP[key] || Briefcase;
