"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, MapPin, Truck, User, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/vehicles/${id}/movements`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading vehicle history...</div>;
  }

  if (!data?.vehicle) {
    return <div className="p-6 text-red-600">Vehicle not found.</div>;
  }

  const { vehicle, movements = [] } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono text-slate-900">{vehicle.chassisNumber}</h1>
            <Badge variant="default">{vehicle.status}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            {vehicle.model?.name} ({vehicle.model?.variant}) • Color: {vehicle.color}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 font-semibold uppercase">
              Motor Number
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm font-bold text-slate-800">{vehicle.motorNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 font-semibold uppercase">
              Battery Number
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm font-bold text-slate-800">{vehicle.batteryNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 font-semibold uppercase">
              Current Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-bold text-emerald-700">
              {vehicle.currentLocationDealer
                ? `Dealer: ${vehicle.currentLocationDealer.name}`
                : "Central Warehouse"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Movement Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Stock Movement & Custody History</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-xs text-slate-500">No stock movements logged yet.</p>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {movements.map((m: any, idx: number) => (
                <div key={idx} className="relative group">
                  <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {m.movementType}
                        </Badge>
                        {m.reference && <span className="font-mono text-slate-600 font-semibold">#{m.reference}</span>}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(m.timestamp).toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 flex items-center gap-2">
                      <span className="font-medium text-slate-500">{m.fromLocation}</span>
                      <ArrowDownRight className="w-3 h-3 text-slate-400 rotate-[-45deg]" />
                      <span className="font-semibold text-emerald-800">{m.toLocation}</span>
                    </div>

                    {m.notes && <p className="text-xs text-slate-500 mt-1 italic">{m.notes}</p>}

                    {m.performedBy && (
                      <p className="text-[10px] text-slate-400 mt-2">
                        Logged by: {m.performedBy.name} ({m.performedBy.employeeCode})
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

