import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const baseSchema = z.object({
  customer_name: z.string().min(2, "Name must be at least 2 characters"),
  customer_email: z.string().email("Please enter a valid email address"),
  customer_phone: z.string().optional(),
});

interface QuoteField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'email' | 'tel';
  required: boolean;
  options?: string[];
}

type QuoteFormValues = Record<string, string> & {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
};

const isQuoteField = (field: unknown): field is QuoteField =>
  typeof field === 'object' && field !== null &&
  'name' in field && typeof (field as { name: unknown }).name === 'string' &&
  'label' in field && typeof (field as { label: unknown }).label === 'string' &&
  'type' in field && typeof (field as { type: unknown }).type === 'string' &&
  'required' in field && typeof (field as { required: unknown }).required === 'boolean';

const FALLBACK_FORM_FIELDS: QuoteField[] = [
  { name: "project_title", label: "Project Title", type: "text", required: true },
  { name: "project_description", label: "Project Description", type: "textarea", required: true },
  { name: "project_location", label: "Project Location", type: "text", required: false },
  { name: "budget_range", label: "Budget Range", type: "select", options: ["Under £1,000", "£1,000-£5,000", "£5,000-£10,000", "£10,000-£25,000", "£25,000+"], required: false },
  { name: "timeline", label: "Preferred Timeline", type: "select", options: ["ASAP", "Within 1 month", "1-3 months", "3-6 months", "6+ months"], required: false }
];

interface QuoteRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contractorId: string;
  contractorName: string;
}

// Note: Rate limiting is now handled server-side in the Edge Function

const QuoteRequestDialog = ({ isOpen, onClose, contractorId, contractorName }: QuoteRequestDialogProps) => {
  const [formFields, setFormFields] = useState<QuoteField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Create dynamic schema based on form fields
  const createSchema = (fields: QuoteField[]) => {
    const schemaFields: Record<string, z.ZodTypeAny> = {
      customer_name: z.string().min(2, "Name must be at least 2 characters"),
      customer_email: z.string().email("Please enter a valid email address"),
      customer_phone: z.string().optional(),
    };

    fields.forEach(field => {
      if (field.required) {
        schemaFields[field.name] = z.string().min(1, `${field.label} is required`);
      } else {
        schemaFields[field.name] = z.string().optional();
      }
    });

    return z.object(schemaFields);
  };

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(createSchema(formFields)),
    defaultValues: {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
    },
  });

  // Load contractor's quote form template
  useEffect(() => {
    const loadQuoteFormTemplate = async () => {
      if (!contractorId || !isOpen) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('quote_form_templates')
          .select('fields')
          .eq('contractor_id', contractorId)
          .eq('is_active', true)
          .single();

        if (error) {
          console.error('Error loading quote form template:', error);
          setFormFields(FALLBACK_FORM_FIELDS);
        } else if (Array.isArray(data?.fields)) {
          const parsedFields: QuoteField[] = [];
          for (const field of data.fields) {
            if (isQuoteField(field)) {
              parsedFields.push({
                name: field.name,
                label: field.label,
                type: field.type,
                required: field.required,
                options: field.options,
              });
            }
          }

          setFormFields(parsedFields.length ? parsedFields : FALLBACK_FORM_FIELDS);
        } else {
          setFormFields(FALLBACK_FORM_FIELDS);
        }
      } catch (error) {
        console.error('Error loading quote form template:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuoteFormTemplate();
  }, [contractorId, isOpen]);

  // Reset form when fields change
  useEffect(() => {
    const defaultValues: QuoteFormValues = {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
    };
    
    formFields.forEach(field => {
      defaultValues[field.name] = "";
    });
    
    form.reset(defaultValues);
  }, [formFields, form]);

  const onSubmit = async (data: QuoteFormValues) => {
    setIsSubmitting(true);
    try {
      // Prepare additional details from custom form fields
      let additionalDetails: Record<string, string> | null = null;
      let projectTitle = data.project_title ?? "";
      let projectDescription = data.project_description ?? "";
      let projectLocation = data.project_location || null;
      let budgetRange = data.budget_range || null;
      let timeline = data.timeline || null;

      // Map form fields to quote data
      formFields.forEach(field => {
        const fieldValue = data[field.name];

        if (field.name === 'project_title') {
          projectTitle = fieldValue;
        } else if (field.name === 'project_description') {
          projectDescription = fieldValue;
        } else if (field.name === 'project_location') {
          projectLocation = fieldValue || null;
        } else if (field.name === 'budget_range') {
          budgetRange = fieldValue || null;
        } else if (field.name === 'timeline') {
          timeline = fieldValue || null;
        } else {
          // Store additional fields in additional_details JSON
          if (fieldValue) {
            additionalDetails = {
              ...(additionalDetails || {}),
              [field.name]: fieldValue,
            };
          }
        }
      });

      // Submit through Edge Function for server-side rate limiting and database insert
      const { data: result, error } = await supabase.functions.invoke('send-quote-notification', {
        body: {
          contractor_id: contractorId,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone || null,
          project_title: projectTitle,
          project_description: projectDescription,
          project_location: projectLocation,
          budget_range: budgetRange,
          timeline: timeline,
          additional_details: additionalDetails,
          contractorName,
        }
      });

      if (error) {
        throw error;
      }

      // Check for rate limit error from Edge Function
      if (result && !result.success) {
        if (result.error?.includes('Too many')) {
          toast({
            title: "Too Many Requests",
            description: "You've submitted too many quote requests. Please wait a few minutes and try again.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(result.error || 'Failed to submit quote');
      }

      toast({
        title: "Quote Request Sent!",
        description: `Your quote request has been sent to ${contractorName}. They will be notified via email.`,
      });

      form.reset();
      onClose();
    } catch (error) {
      console.error('Error submitting quote request:', error);
      toast({
        title: "Error",
        description: "Failed to send quote request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: QuoteField) => {
    const fieldName = field.name as keyof typeof form.control._defaultValues;
    
    return (
      <FormField
        key={field.name}
        control={form.control}
        name={fieldName}
        render={({ field: formField }) => (
          <FormItem>
            <FormLabel>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </FormLabel>
            <FormControl>
              {field.type === 'textarea' ? (
                <Textarea 
                  {...formField}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  className="min-h-20"
                />
              ) : field.type === 'select' ? (
                <Select value={formField.value} onValueChange={formField.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  {...formField}
                  type={field.type}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Quote from {contractorName}</DialogTitle>
          <DialogDescription>
            Fill out the form below to request a detailed quote for your project.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading form...</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Customer Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Your Information</h3>
                
                <FormField
                  control={form.control}
                  name="customer_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Full Name <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter your full name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customer_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Email Address <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="Enter your email address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customer_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="Enter your phone number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Project Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Project Information</h3>
                {formFields.map(renderField)}
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Quote Request
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuoteRequestDialog;