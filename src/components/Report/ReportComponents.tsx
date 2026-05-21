'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { useAppStore } from '@/lib/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getPSColor } from '@/lib/utils/colors';

export function RadarChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const { nodes, psHistory } = useAppStore();

  const categoryScores = useMemo(() => {
    const categories = [
      { name: '言语理解', ids: ['k_1'] },
      { name: '数量关系', ids: ['k_2'] },
      { name: '判断推理', ids: ['k_3'] },
      { name: '资料分析', ids: ['k_4'] },
      { name: '常识判断', ids: ['k_5'] },
    ];

    return categories.map(cat => {
      const categoryNodes = nodes.filter(n =>
        cat.ids.some(id => n.id === id || n.parent_id === id)
      );

      if (categoryNodes.length === 0) {
        return { name: cat.name, value: 50 };
      }

      const avgPS = categoryNodes.reduce((sum, n) => sum + n.ps_score, 0) / categoryNodes.length;
      return { name: cat.name, value: Math.round(avgPS) };
    });
  }, [nodes]);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
      },
      radar: {
        indicator: categoryScores.map(s => ({
          name: s.name,
          max: 200,
        })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          color: '#64748b',
          fontSize: 12,
        },
        splitLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1'].map(c => `${c}40`),
          },
        },
        axisLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: categoryScores.map(s => s.value),
              name: '能力矩阵',
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                width: 3,
                color: '#0891b2',
              },
              areaStyle: {
                color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [
                  { offset: 0, color: '#0891b280' },
                  { offset: 1, color: '#0891b220' },
                ]),
              },
              itemStyle: {
                color: '#0891b2',
                borderColor: '#fff',
                borderWidth: 2,
              },
            },
          ],
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [categoryScores]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>能力矩阵雷达图</span>
          <Badge variant="outline">综合能力评估</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="w-full h-[350px]" />
      </CardContent>
    </Card>
  );
}

export function PSTrendChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const { psHistory, nodes } = useAppStore();
  const [selectedNode, setSelectedNode] = useState<string>('all');

  const weakNodes = useMemo(() => {
    return nodes.filter(n => n.ps_score < 80);
  }, [nodes]);

  const chartData = useMemo(() => {
    if (selectedNode === 'all') {
      const historyByDate = new Map<string, { total: number; count: number }>();

      psHistory.forEach(record => {
        const date = record.recorded_at.split('T')[0];
        const existing = historyByDate.get(date) || { total: 0, count: 0 };
        historyByDate.set(date, {
          total: existing.total + record.ps_score,
          count: existing.count + 1,
        });
      });

      const sortedDates = Array.from(historyByDate.keys()).sort();
      return {
        dates: sortedDates,
        values: sortedDates.map(date => {
          const data = historyByDate.get(date)!;
          return Math.round(data.total / data.count);
        }),
      };
    }

    const nodeHistory = psHistory
      .filter(r => r.node_id === selectedNode)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    return {
      dates: nodeHistory.map(r => r.recorded_at.split('T')[0]),
      values: nodeHistory.map(r => r.ps_score),
    };
  }, [psHistory, selectedNode]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const data = params[0];
          return `${data.axisValue}<br/>PS: ${data.value}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: chartData.dates,
        axisLine: {
          lineStyle: {
            color: '#e2e8f0',
          },
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 200,
        splitLine: {
          lineStyle: {
            color: '#f1f5f9',
          },
        },
        axisLine: {
          show: false,
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
        },
      },
      series: [
        {
          name: 'PS 分数',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          sampling: 'average',
          itemStyle: {
            color: '#0891b2',
          },
          lineStyle: {
            width: 3,
            color: '#0891b2',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#0891b240' },
              { offset: 1, color: '#0891b205' },
            ]),
          },
          data: chartData.values,
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>PS 掌握度趋势</span>
          <Select value={selectedNode} onValueChange={setSelectedNode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="选择知识点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平均</SelectItem>
              {weakNodes.map(node => (
                <SelectItem key={node.id} value={node.id}>
                  {node.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="w-full h-[300px]" />
      </CardContent>
    </Card>
  );
}

export function HoneycombMap() {
  const { nodes } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const hexSize = 30;
    const hexHeight = hexSize * Math.sqrt(3);
    const hexWidth = hexSize * 2;
    const cols = Math.ceil(rect.width / (hexWidth * 0.75)) + 1;
    const rows = Math.ceil(rect.height / hexHeight) + 1;

    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * hexWidth * 0.75;
        const y = row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0);

        const node = nodes[index % nodes.length];
        const color = node ? getPSColor(node.ps_score) : getPSColor(50);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = x + hexSize * Math.cos(angle);
          const hy = y + hexSize * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        ctx.fillStyle = color.background + '80';
        ctx.fill();
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (node && node.name.length > 0) {
          ctx.fillStyle = '#64748b';
          ctx.font = '8px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const displayName = node.name.length > 4 ? node.name.slice(0, 4) + '..' : node.name;
          ctx.fillText(displayName, x, y);
        }

        index++;
      }
    }
  }, [nodes]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>知识扫雷全景图</span>
          <Badge variant="outline">游戏化视图</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#DC2626]" />
            <span className="text-xs text-muted-foreground">薄弱</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#EA580C]" />
            <span className="text-xs text-muted-foreground">需加强</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#CA8A04]" />
            <span className="text-xs text-muted-foreground">学习中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#0891B2]" />
            <span className="text-xs text-muted-foreground">熟练</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportDashboard() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-2">
        <h2 className="text-2xl font-bold tracking-tight">数据报告</h2>
        <p className="text-muted-foreground">
          全面了解你的学习进度和能力分布
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 pt-2 space-y-6">
          <Tabs defaultValue="radar" className="space-y-6">
            <TabsList>
              <TabsTrigger value="radar">能力雷达</TabsTrigger>
              <TabsTrigger value="trend">PS 趋势</TabsTrigger>
              <TabsTrigger value="map">全景图</TabsTrigger>
            </TabsList>

            <TabsContent value="radar" className="space-y-6">
              <RadarChart />
            </TabsContent>

            <TabsContent value="trend" className="space-y-6">
              <PSTrendChart />
            </TabsContent>

            <TabsContent value="map" className="space-y-6">
              <HoneycombMap />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
