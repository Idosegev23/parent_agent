'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Users, 
  MessageSquare, 
  Check, 
  X, 
  RefreshCw,
  Loader2,
  Link as LinkIcon,
  Search,
  Plus,
  History
} from 'lucide-react';

interface Group {
  id: string;
  wa_group_id: string;
  name: string;
  type: string;
  is_active: boolean;
  child_id: string | null;
  child_name?: string;
}

interface Child {
  id: string;
  name: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanningGroup, setScanningGroup] = useState<string | null>(null);

  // Filter and sort groups - active first, then by name
  const filteredGroups = groups
    .filter(group => group.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Active groups first
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      // Then by name
      return a.name.localeCompare(b.name, 'he');
    });

  const activeGroupsWithChild = groups.filter(g => g.is_active && g.child_id);
  const [isScanningAll, setIsScanningAll] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const [{ data: groupsData }, { data: childrenData }] = await Promise.all([
      supabase
        .from('groups')
        .select('*, children(name)')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('children')
        .select('id, name')
        .eq('user_id', user.id)
    ]);

    if (groupsData) {
      setGroups((groupsData as any[]).map(g => ({
        ...g,
        child_name: g.children?.name
      })));
    }

    if (childrenData) {
      setChildren(childrenData);
    }

    setIsLoading(false);
  };

  const handleAssignChild = async (groupId: string, childId: string | null) => {
    const supabase = createClient();
    
    await (supabase.from('groups') as any)
      .update({ 
        child_id: childId,
        is_active: childId !== null // Activate when assigned to a child
      })
      .eq('id', groupId);

    setEditingGroup(null);
    loadData();
  };

  const handleToggleActive = async (groupId: string, isActive: boolean) => {
    const supabase = createClient();
    
    await (supabase.from('groups') as any)
      .update({ is_active: isActive })
      .eq('id', groupId);

    loadData();
  };

  const handleSetType = async (groupId: string, type: string) => {
    const supabase = createClient();
    
    await (supabase.from('groups') as any)
      .update({ type })
      .eq('id', groupId);

    // If setting as activity type and group has a child assigned, offer to create activity
    const group = groups.find(g => g.id === groupId);
    if (type === 'activity' && group?.child_id) {
      const shouldCreate = window.confirm(
        `האם ליצור חוג "${group.name}" עבור ${group.child_name}?\n\nתוכל לערוך את הפרטים אח"כ.`
      );
      
      if (shouldCreate) {
        await createActivityFromGroup(group);
      }
    }

    loadData();
  };

  const createActivityFromGroup = async (group: Group) => {
    const supabase = createClient();
    
    // Check if activity already exists for this group
    const { data: existing } = await supabase
      .from('activities')
      .select('id')
      .eq('group_id', group.id)
      .single();

    if (existing) {
      alert('כבר קיים חוג מקושר לקבוצה זו');
      return;
    }

    // Create the activity
    await (supabase.from('activities') as any)
      .insert({
        child_id: group.child_id!,
        group_id: group.id,
        name: group.name.replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, '').trim(), // Clean name
        schedule: []
      });

    alert(`החוג "${group.name}" נוצר בהצלחה!\nלחץ על "חוגים" בתפריט כדי לערוך פרטים.`);
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      // Refresh the data from the database
      await loadData();
    } catch (error) {
      console.error('Failed to sync:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const scanGroupHistory = async (groupId: string) => {
    setScanningGroup(groupId);
    const supabase = createClient();
    
    try {
      // Create a scan request
      const { data, error } = await (supabase.from('scan_requests') as any)
        .insert({ group_id: groupId })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: status } = await (supabase.from('scan_requests') as any)
          .select('status, messages_found, error_message')
          .eq('id', data.id)
          .single();

        if (status?.status === 'completed') {
          alert(`נסרקו ${status.messages_found} הודעות בהצלחה!`);
          break;
        } else if (status?.status === 'failed') {
          throw new Error(status.error_message || 'שגיאה בסריקה');
        }
        
        attempts++;
      }

      if (attempts >= maxAttempts) {
        alert('הסריקה נמשכת ברקע. בדוק שוב בעוד מספר דקות.');
      }
    } catch (error) {
      console.error('Scan failed:', error);
      alert('שגיאה בסריקת ההודעות');
    } finally {
      setScanningGroup(null);
    }
  };

  const scanAllActiveGroups = async () => {
    const groupsToScan = activeGroupsWithChild;
    if (groupsToScan.length === 0) {
      alert('אין קבוצות פעילות עם ילד משויך לסריקה');
      return;
    }

    if (!confirm(`לסרוק ${groupsToScan.length} קבוצות פעילות?`)) return;

    setIsScanningAll(true);
    const supabase = createClient();
    let successCount = 0;
    let failCount = 0;

    for (const group of groupsToScan) {
      try {
        // Create scan request
        const { data, error } = await (supabase.from('scan_requests') as any)
          .insert({ group_id: group.id })
          .select()
          .single();

        if (error) throw error;

        // Wait for completion (with shorter timeout for batch)
        let attempts = 0;
        while (attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const { data: status } = await (supabase.from('scan_requests') as any)
            .select('status')
            .eq('id', data.id)
            .single();

          if (status?.status === 'completed') {
            successCount++;
            break;
          } else if (status?.status === 'failed') {
            failCount++;
            break;
          }
          attempts++;
        }
      } catch {
        failCount++;
      }
    }

    setIsScanningAll(false);
    alert(`סריקה הסתיימה!\nהצלחות: ${successCount}\nכשלונות: ${failCount}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">קבוצות WhatsApp</h1>
          <p className="text-muted-foreground">
            {searchQuery ? `${filteredGroups.length} מתוך ` : ''}{groups.length} קבוצות • {groups.filter(g => g.is_active).length} פעילות
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeGroupsWithChild.length > 0 && (
            <button
              onClick={scanAllActiveGroups}
              disabled={isScanningAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isScanningAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <History className="w-4 h-4" />
              )}
              סרוק הכל ({activeGroupsWithChild.length})
            </button>
          )}
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            רענן קבוצות
          </button>
        </div>
      </div>

      {/* Search box */}
      {groups.length > 0 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="חפש קבוצה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pr-11 pl-4 rounded-xl border border-input bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {children.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            <strong>שים לב:</strong> צריך קודם להוסיף ילדים כדי לשייך אליהם קבוצות.
          </p>
          <a href="/children/new" className="text-yellow-700 underline text-sm">
            הוסף ילד עכשיו
          </a>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">אין קבוצות</h2>
          <p className="text-muted-foreground mb-4">
            לא נמצאו קבוצות WhatsApp. וודא שה-WhatsApp מחובר ולחץ על "רענן קבוצות".
          </p>
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            סרוק קבוצות
          </button>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            לא נמצאו קבוצות עבור "{searchQuery}"
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-primary hover:underline text-sm"
          >
            נקה חיפוש
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className={`bg-white rounded-xl border p-4 transition-all ${
                group.is_active ? 'border-green-200 bg-green-50/30' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Status indicator */}
                <div className={`w-3 h-3 rounded-full ${
                  group.is_active ? 'bg-green-500' : 'bg-gray-300'
                }`} />

                {/* Group info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{group.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Type selector */}
                    <select
                      value={group.type}
                      onChange={(e) => handleSetType(group.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded border bg-white"
                    >
                      <option value="general">כללי</option>
                      <option value="class">כיתה</option>
                      <option value="activity">חוג</option>
                      <option value="parents">הורים</option>
                    </select>
                    
                    {group.child_name && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {group.child_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Child assignment */}
                <div className="flex items-center gap-2">
                  {editingGroup === group.id ? (
                    <select
                      autoFocus
                      value={group.child_id || ''}
                      onChange={(e) => handleAssignChild(group.id, e.target.value || null)}
                      onBlur={() => setEditingGroup(null)}
                      className="px-3 py-2 rounded-lg border"
                    >
                      <option value="">ללא שיוך</option>
                      {children.map(child => (
                        <option key={child.id} value={child.id}>{child.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingGroup(group.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-muted/50"
                    >
                      <LinkIcon className="w-4 h-4" />
                      {group.child_id ? 'שנה שיוך' : 'שייך לילד'}
                    </button>
                  )}

                  {/* Create activity button - show for activity type groups with child */}
                  {group.type === 'activity' && group.child_id && (
                    <button
                      onClick={() => createActivityFromGroup(group)}
                      className="p-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200"
                      title="צור חוג מקבוצה זו"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}

                  {/* Scan history button - show for active groups */}
                  {group.is_active && group.child_id && (
                    <button
                      onClick={() => scanGroupHistory(group.id)}
                      disabled={scanningGroup === group.id}
                      className="p-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                      title="סרוק הודעות קיימות"
                    >
                      {scanningGroup === group.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <History className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(group.id, !group.is_active)}
                    className={`p-2 rounded-lg ${
                      group.is_active 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={group.is_active ? 'פעיל - לחץ לביטול' : 'לא פעיל - לחץ להפעלה'}
                  >
                    {group.is_active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-muted/30 rounded-lg p-4">
        <h3 className="font-medium mb-2">מקרא:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>קבוצה פעילה</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300" />
            <span>קבוצה לא פעילה</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">ילד</span>
            <span>משויך לילד</span>
          </div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <span>סרוק הודעות קודמות</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          רק קבוצות פעילות ייסרקו להודעות. לחץ על כפתור ההיסטוריה כדי לסרוק הודעות קיימות מהקבוצה.
        </p>
      </div>
    </div>
  );
}

